import { loadConfig } from "./config.js";

/** Internal state tracked per API key. */
interface KeyState {
  /** The API key string. */
  key: string;
  /** Timestamp (ms) until which this key is considered exhausted. 0 = available. */
  exhaustedUntil: number;
  /** Total number of requests routed through this key. */
  requestCount: number;
}

/** Pool of API keys with round-robin selection and cooldown tracking. */
let pool: KeyState[] = [];
/** Index of the last key returned by {@link pick}. */
let currentIdx = 0;

/**
 * Initialize the key pool from the current configuration.
 * Must be called once at startup before any calls to {@link pick}.
 */
export function initPool(): void {
  const config = loadConfig();
  pool = config.apiKeys.map((key) => ({
    key,
    exhaustedUntil: 0,
    requestCount: 0,
  }));
  currentIdx = 0;
}

/**
 * Select the next available API key using round-robin.
 *
 * Skips keys that are still in cooldown. If all keys are exhausted and the
 * earliest cooldown has been active for longer than the configured cooldown
 * period (indicating a stale/stuck state), it force-releases that key.
 *
 * @returns The selected key and its pool index, or `null` if all keys are
 *          exhausted and none can be released.
 */
export function pick(): { key: string; index: number } | null {
  const now = Date.now();

  // Try each key starting from currentIdx, looking for an available one.
  for (let i = 0; i < pool.length; i++) {
    const idx = (currentIdx + i) % pool.length;
    const state = pool[idx];
    if (now >= state.exhaustedUntil) {
      currentIdx = (idx + 1) % pool.length;
      state.requestCount++;
      return { key: state.key, index: idx };
    }
  }

  // All keys exhausted. If the earliest cooldown is suspiciously old
  // (somehow beyond cooldownMs), force-release it as a safety valve.
  const config = loadConfig();
  const earliest = pool.reduce((min, s) =>
    s.exhaustedUntil < min.exhaustedUntil ? s : min,
  );
  const waitMs = Math.max(0, earliest.exhaustedUntil - now);
  if (waitMs > config.cooldownMs) {
    const earliestIdx = pool.indexOf(earliest);
    earliest.exhaustedUntil = 0;
    earliest.requestCount++;
    currentIdx = (earliestIdx + 1) % pool.length;
    return { key: earliest.key, index: earliestIdx };
  }

  return null;
}

/**
 * Mark a key as exhausted (hit quota). It will be skipped for the
 * configured cooldown duration.
 *
 * @param index - Pool index returned by {@link pick}.
 */
export function markExhausted(index: number): void {
  const config = loadConfig();
  const state = pool[index];
  if (!state) return;

  state.exhaustedUntil = Date.now() + config.cooldownMs;
  console.log(
    `[pool] key ${index} (${state.key.slice(0, 8)}...) exhausted, cooldown ${config.cooldownMs / 1000}s`,
  );
}

/**
 * Get a snapshot of the current key pool status.
 *
 * @returns Object with total count, available count, and per-key details
 *          (key prefix only for safety).
 */
export function getPoolStatus(): {
  total: number;
  available: number;
  keys: Array<{
    index: number;
    key: string;
    available: boolean;
    requests: number;
  }>;
} {
  const now = Date.now();
  let available = 0;
  const keys = pool.map((state, index) => {
    const avail = now >= state.exhaustedUntil;
    if (avail) available++;
    return {
      index,
      key: state.key.slice(0, 8) + "...",
      available: avail,
      requests: state.requestCount,
    };
  });
  return { total: pool.length, available, keys };
}
