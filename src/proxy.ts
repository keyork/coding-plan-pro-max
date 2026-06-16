import type { Context } from "hono";
import { loadConfig, normalizeModelName } from "./config.js";
import { pick, markExhausted, recordSuccess, recordError, poolSize, earliestRecoveryMs } from "./key-pool.js";
import { semaphore } from "./semaphore.js";
import { log, fmtKey, fmtStatus, fmtModel, fmtMs } from "./log.js";

const MAX_RETRIES = 3;

const QUOTA_KEYWORDS = [
  "quota",
  "limit",
  "exceeded",
  "余额",
  "限制",
] as const;

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

interface ChatCompletionRequest {
  model?: string;
  messages?: unknown[];
  stream?: boolean;
  [key: string]: unknown;
}

export async function handleChatCompletions(c: Context): Promise<Response> {
  const sem = semaphore();
  await sem.acquire();
  const t0 = Date.now();
  const response = await handleChatCompletionsInner(c, t0);

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

async function handleChatCompletionsInner(c: Context, t0: number): Promise<Response> {
  const config = loadConfig();

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

  body.model = normalizeModelName(body.model);
  const upstreamURL = `${config.upstreamBaseURL}/chat/completions`;
  const abortSignal = c.req.raw.signal;
  const stream = body.stream === true;

  log.info("proxy", `→ ${fmtModel(body.model)} stream=${stream}`);

  const maxKeyAttempts = poolSize();
  let lastError: string | null = null;
  let lastResult: Response | null = null;

  // Outer loop: rotate to a new key (only on quota exhaustion)
  for (let keyAttempt = 0; keyAttempt < maxKeyAttempts; keyAttempt++) {
    let entry = pick();
    if (!entry) {
      const waitMs = earliestRecoveryMs();
      if (Number.isFinite(waitMs) && waitMs <= 15000) {
        log.warn("proxy", `⏳ All keys in cooldown, waiting ${fmtMs(waitMs)} for recovery...`);
        await new Promise((r) => setTimeout(r, waitMs + 500));
        entry = pick();
      }
    }
    if (!entry) {
      log.error("proxy", `✗ All keys exhausted ${fmtMs(Date.now() - t0)}`);
      return errorResponse(
        "All API keys exhausted",
        "proxy_error",
        503,
      );
    }

    // Inner loop: retry same key on transient errors
    let switchedKey = false;
    for (let retry = 0; retry < MAX_RETRIES && !switchedKey; retry++) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${entry.key}`,
      };

      const attemptT0 = Date.now();
      let result: Response;
      try {
        result = stream
          ? await forwardStreaming(upstreamURL, body, headers, abortSignal)
          : await forwardNonStreaming(upstreamURL, body, headers, abortSignal);
      } catch (err) {
        const errMsg = `Network error: ${String(err)}`;
        recordError(entry.index, errMsg);
        lastError = errMsg;
        log.warn(
          "proxy",
          `✗ retry ${retry + 1}/${MAX_RETRIES} ${fmtKey(entry.key, entry.index)} ${errMsg} ${fmtMs(Date.now() - attemptT0)}`,
        );
        continue;
      }

      // Success
      if (result.ok) {
        recordSuccess(entry.index);
        log.success(
          "proxy",
          `✓ ${fmtKey(entry.key, entry.index)} ${fmtModel(body.model)} ${fmtStatus(result.status)} ${fmtMs(Date.now() - t0)}`,
        );
        return result;
      }

      // Quota error → switch key
      const responseText = await result.clone().text();
      if (isQuotaError(result.status, responseText)) {
        const errMsg = `Quota exhausted (${result.status})`;
        recordError(entry.index, errMsg);
        markExhausted(entry.index);
        lastError = errMsg;
        log.warn(
          "proxy",
          `✗ ${fmtKey(entry.key, entry.index)} ${errMsg} → rotating key ${fmtMs(Date.now() - attemptT0)}`,
        );
        switchedKey = true;
        break;
      }

      // All other upstream errors → retry same key
      const errMsg = `Upstream error ${result.status}`;
      recordError(entry.index, errMsg);
      lastError = errMsg;
      lastResult = result;
      log.warn(
        "proxy",
        `✗ retry ${retry + 1}/${MAX_RETRIES} ${fmtKey(entry.key, entry.index)} ${errMsg} ${fmtMs(Date.now() - attemptT0)}`,
      );
    }
  }

  log.error(
    "proxy",
    `✗ ${fmtModel(body.model)} all retries exhausted: ${lastError} ${fmtMs(Date.now() - t0)}`,
  );

  if (lastResult) {
    return lastResult;
  }

  return errorResponse(
    lastError
      ? `All retries exhausted: ${lastError}`
      : "All API keys exhausted after retries",
    "proxy_error",
    503,
  );
}

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

  if (!upstreamRes.ok) {
    const errorBody = await upstreamRes.text();
    return new Response(errorBody, {
      status: upstreamRes.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!upstreamRes.body) {
    return errorResponse(
      "Upstream returned empty body",
      "proxy_error",
      502,
    );
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
