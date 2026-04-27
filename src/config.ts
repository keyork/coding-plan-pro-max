import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadCredentials } from "./credentials.js";

export interface Config {
  apiKeys: string[];
  upstreamBaseURL: string;
  port: number;
  cooldownMs: number;
  maxParallel: number;
}

let cached: Config | undefined;

function parseEnvFile(path: string): void {
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return;
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();

    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    } else {
      const commentIdx = val.indexOf(" #");
      if (commentIdx !== -1) {
        val = val.slice(0, commentIdx).trimEnd();
      }
    }

    if (key && !process.env[key]) {
      process.env[key] = val;
    }
  }
}

function parseKeys(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Load and validate application configuration.
 *
 * Resolution order (highest priority first):
 *   1. Environment variables (API_KEY, UPSTREAM_BASE_URL, PORT, COOLDOWN_MS)
 *   2. Credentials file (~/.config/coding-plan-pro-max/credentials)
 *   3. .env file in current working directory
 *   4. Defaults (port 3000, cooldown 18000000ms)
 */
export function loadConfig(): Config {
  if (cached) return cached;

  parseEnvFile(resolve(process.cwd(), ".env"));

  // --- API Keys: env > credentials file ---
  let apiKeys: string[] = [];
  const envKeys = process.env.API_KEY;
  if (envKeys) {
    apiKeys = parseKeys(envKeys);
  }

  if (apiKeys.length === 0) {
    const stored = loadCredentials();
    if (stored) {
      apiKeys = stored.apiKeys;
    }
  }

  if (apiKeys.length === 0) {
    console.error(
      "No API keys found. Run `coding-plan-pro-max auth login` or set API_KEY env var.",
    );
    process.exit(1);
  }

  // --- Upstream base URL: env > credentials file ---
  let upstreamBaseURL = process.env.UPSTREAM_BASE_URL;
  if (!upstreamBaseURL) {
    const stored = loadCredentials();
    if (stored) {
      upstreamBaseURL = stored.upstreamBaseURL;
    }
  }

  if (!upstreamBaseURL) {
    console.error(
      "No upstream URL found. Run `coding-plan-pro-max auth login` or set UPSTREAM_BASE_URL env var.",
    );
    process.exit(1);
  }

  try {
    new URL(upstreamBaseURL);
  } catch {
    console.error(`Invalid UPSTREAM_BASE_URL: "${upstreamBaseURL}".`);
    process.exit(1);
  }

  // --- Port ---
  const port = parseInt(process.env.PORT ?? "3000", 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    console.error(`Invalid PORT: "${process.env.PORT}". Must be 1-65535.`);
    process.exit(1);
  }

  // --- Cooldown ---
  const cooldownMs = parseInt(process.env.COOLDOWN_MS ?? "18000000", 10);
  if (!Number.isFinite(cooldownMs) || cooldownMs < 0) {
    console.error(`Invalid COOLDOWN_MS: "${process.env.COOLDOWN_MS}".`);
    process.exit(1);
  }

  // --- Max parallel ---
  const maxParallel = parseInt(process.env.MAX_PARALLEL ?? "4", 10);
  if (!Number.isFinite(maxParallel) || maxParallel < 1) {
    console.error(`Invalid MAX_PARALLEL: "${process.env.MAX_PARALLEL}". Must be >= 1.`);
    process.exit(1);
  }

  cached = {
    apiKeys,
    upstreamBaseURL: upstreamBaseURL.replace(/\/+$/, ""),
    port,
    cooldownMs,
    maxParallel,
  };

  return cached;
}

export function normalizeModelName(model: string): string {
  const slashIdx = model.indexOf("/");
  return slashIdx === -1 ? model : model.slice(slashIdx + 1);
}
