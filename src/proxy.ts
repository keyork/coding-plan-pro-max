import type { Context } from "hono";
import { loadConfig, normalizeModelName } from "./config.js";
import { pick, markExhausted } from "./key-pool.js";
import { semaphore } from "./semaphore.js";

/** Maximum number of key-rotation retries per request. */
const MAX_RETRIES = 5;

/** Quota-related keywords found in upstream 403 error messages. */
const QUOTA_KEYWORDS = [
  "quota",
  "limit",
  "exceeded",
  "余额",
  "限制",
] as const;

/**
 * Determine whether an upstream HTTP response indicates a quota exhaustion.
 *
 * Returns `true` for any 429, or for 403 responses whose error message
 * contains a quota-related keyword.
 */
function isQuotaError(status: number, body: string): boolean {
  if (status === 429) return true;
  if (status === 403) {
    try {
      const parsed = JSON.parse(body);
      const msg: string = parsed?.error?.message ?? "";
      return QUOTA_KEYWORDS.some((kw) => msg.includes(kw));
    } catch {
      // Body is not JSON — cannot determine, assume not quota.
    }
  }
  return false;
}

/**
 * Build a standard OpenAI-style error response.
 */
function errorResponse(
  message: string,
  type: string,
  status: number,
): Response {
  return new Response(
    JSON.stringify({ error: { message, type } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Handle `GET /v1/models` — proxy the request to the upstream models endpoint.
 *
 * Uses a key from the pool for authentication. Returns 503 if all keys
 * are exhausted.
 */
export async function handleModels(c: Context): Promise<Response> {
  const config = loadConfig();
  const entry = pick();
  if (!entry) {
    return errorResponse(
      "All API keys exhausted",
      "proxy_error",
      503,
    );
  }

  try {
    const res = await fetch(`${config.upstreamBaseURL}/models`, {
      headers: { Authorization: `Bearer ${entry.key}` },
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return errorResponse(
      `Upstream unreachable: ${String(err)}`,
      "proxy_error",
      502,
    );
  }
}

/** Shape of a chat completion request body (loosely typed for pass-through). */
interface ChatCompletionRequest {
  model?: string;
  messages?: unknown[];
  stream?: boolean;
  [key: string]: unknown;
}

/**
 * Handle `POST /v1/chat/completions`.
 *
 * Validates the request body, strips any provider prefix from the model name,
 * then forwards to the upstream API with key rotation and automatic retry
 * on quota exhaustion (429 / 403-with-quota-keyword).
 *
 * Supports both streaming (SSE) and non-streaming responses.
 */
export async function handleChatCompletions(c: Context): Promise<Response> {
  const sem = semaphore();
  await sem.acquire();
  const response = await handleChatCompletionsInner(c);

  if (response.body) {
    return new Response(
      wrapBodyWithRelease(response.body, () => sem.release()),
      {
        status: response.status,
        headers: response.headers,
      },
    );
  }

  sem.release();
  return response;
}

function wrapBodyWithRelease(
  body: ReadableStream<Uint8Array>,
  onDone: () => void,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let released = false;

  const release = () => {
    if (!released) {
      released = true;
      onDone();
    }
  };

  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          release();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        release();
        controller.error(err);
      }
    },
    cancel() {
      release();
      reader.cancel().catch(() => {});
    },
  });
}

async function handleChatCompletionsInner(c: Context): Promise<Response> {
  const config = loadConfig();

  // --- Parse request body ---
  let body: ChatCompletionRequest;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(
      "Invalid JSON in request body",
      "invalid_request_error",
      400,
    );
  }

  // --- Validate required fields ---
  if (!body.model || typeof body.model !== "string") {
    return errorResponse(
      "Missing or invalid 'model' field",
      "invalid_request_error",
      400,
    );
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return errorResponse(
      "Missing or empty 'messages' field",
      "invalid_request_error",
      400,
    );
  }

  // --- Prepare upstream request ---
  body.model = normalizeModelName(body.model);
  const upstreamURL = `${config.upstreamBaseURL}/chat/completions`;
  const abortSignal = c.req.raw.signal;

  // --- Retry loop with key rotation ---
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const entry = pick();
    if (!entry) {
      return errorResponse(
        "All API keys exhausted",
        "proxy_error",
        503,
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${entry.key}`,
    };

    try {
      if (body.stream === true) {
        const result = await forwardStreaming(
          upstreamURL,
          body,
          headers,
          abortSignal,
        );

        // If the upstream returned an error status, check for quota error
        // and retry with the next key.
        if (result.status === 429 || result.status === 403) {
          const text = await result.clone().text();
          if (isQuotaError(result.status, text)) {
            markExhausted(entry.index);
            continue;
          }
        }

        return result;
      }

      // Non-streaming path
      const result = await forwardNonStreaming(upstreamURL, body, headers, abortSignal);
      if (isQuotaError(result.status, await result.clone().text())) {
        markExhausted(entry.index);
        continue;
      }
      return result;
    } catch (err) {
      return errorResponse(
        `Upstream request failed: ${String(err)}`,
        "proxy_error",
        502,
      );
    }
  }

  return errorResponse(
    "All API keys exhausted after retries",
    "proxy_error",
    503,
  );
}

/**
 * Forward a non-streaming chat completion request to the upstream API.
 *
 * Returns the upstream response body verbatim with the original status code.
 */
async function forwardNonStreaming(
  upstreamURL: string,
  body: unknown,
  headers: Record<string, string>,
  abortSignal: AbortSignal,
): Promise<Response> {
  const upstreamRes = await fetch(upstreamURL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  const responseBody = await upstreamRes.text();
  return new Response(responseBody, {
    status: upstreamRes.status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Forward a streaming (SSE) chat completion request to the upstream API.
 *
 * For successful responses (2xx), the upstream body is piped directly as
 * `text/event-stream`. For error responses, the body is read fully and
 * returned as JSON so the caller can inspect the status code and body.
 *
 * The client-side abort signal is forwarded so that disconnecting the client
 * also cancels the upstream request.
 */
async function forwardStreaming(
  upstreamURL: string,
  body: unknown,
  headers: Record<string, string>,
  abortSignal: AbortSignal,
): Promise<Response> {
  const upstreamRes = await fetch(upstreamURL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  // For error responses, fully read the body and return it so the caller
  // can inspect status code + body for quota-error detection.
  if (!upstreamRes.ok) {
    const errorBody = await upstreamRes.text();
    return new Response(errorBody, {
      status: upstreamRes.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Happy path: pipe the SSE stream through.
  if (!upstreamRes.body) {
    return errorResponse(
      "Upstream returned empty body",
      "proxy_error",
      502,
    );
  }

  abortSignal.addEventListener("abort", () => upstreamRes.body?.cancel(), { once: true });

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
