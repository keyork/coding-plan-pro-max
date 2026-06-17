import { loadConfig, type KeyMode } from "./config.js";
import { log, fmtKey, fmtMs } from "./log.js";

const RETRIES_PER_KEY = 3;

/** Random cooldown between 5s and 10s (5000–10000 ms). */
const COOLDOWN_MIN_MS = 5000;
const COOLDOWN_MAX_MS = 10000;

function randomCooldownMs(): number {
  return COOLDOWN_MIN_MS + Math.floor(Math.random() * (COOLDOWN_MAX_MS - COOLDOWN_MIN_MS + 1));
}

/** Internal state tracked per API key. */
interface KeyState {
  /** The API key string. */
  key: string;
  /** Timestamp (ms) until which this key is considered exhausted. 0 = available. */
  exhaustedUntil: number;
  /** Permanently removed from rotation (failed health check). */
  disabled: boolean;
  /** Total number of requests routed through this key. */
  requestCount: number;
  /** Total number of successful responses. */
  successCount: number;
  /** Total number of error responses (including quota errors). */
  errorCount: number;
  /** Number of consecutive errors (reset on success). */
  consecutiveErrors: number;
  /** Description of the last error. */
  lastError: string | null;
  /** Timestamp of the last error. */
  lastErrorTime: number | null;
  /** Timestamp of the last successful response. */
  lastSuccessTime: number | null;
}

/** Health status of a single key. */
export type KeyHealthStatus = "healthy" | "degraded" | "exhausted" | "failing" | "disabled";

/** Pool of API keys with round-robin selection and cooldown tracking. */
let pool: KeyState[] = [];
let currentIdx = 0;
let activeKeyMode: KeyMode = "round-robin";

export function initPool(): void {
  const config = loadConfig();
  activeKeyMode = config.keyMode;
  pool = config.apiKeys.map((key) => ({
    key,
    exhaustedUntil: 0,
    disabled: false,
    requestCount: 0,
    successCount: 0,
    errorCount: 0,
    consecutiveErrors: 0,
    lastError: null,
    lastErrorTime: null,
    lastSuccessTime: null,
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

  // Squeeze mode: prefer the last used key if it's still available
  if (activeKeyMode === "squeeze" && pool.length > 0) {
    const lastIdx = (currentIdx - 1 + pool.length) % pool.length;
    const lastState = pool[lastIdx];
    if (lastState && !lastState.disabled && now >= lastState.exhaustedUntil) {
      lastState.requestCount++;
      return { key: lastState.key, index: lastIdx };
    }
  }

  // Round-robin fallback (also used when squeeze key is exhausted)
  for (let i = 0; i < pool.length; i++) {
    const idx = (currentIdx + i) % pool.length;
    const state = pool[idx];
    if (!state.disabled && now >= state.exhaustedUntil) {
      currentIdx = (idx + 1) % pool.length;
      state.requestCount++;
      return { key: state.key, index: idx };
    }
  }

  // All non-disabled keys exhausted — force-release earliest if stale
  const candidates = pool.filter((s) => !s.disabled);
  if (candidates.length === 0) {
    return null;
  }
  const earliest = candidates.reduce((min, s) =>
    s.exhaustedUntil < min.exhaustedUntil ? s : min,
  );
  const waitMs = Math.max(0, earliest.exhaustedUntil - now);
  if (waitMs > COOLDOWN_MAX_MS * 2) {
    const earliestIdx = pool.indexOf(earliest);
    earliest.exhaustedUntil = 0;
    earliest.requestCount++;
    currentIdx = (earliestIdx + 1) % pool.length;
    return { key: earliest.key, index: earliestIdx };
  }

  return null;
}

export function poolSize(): number {
  return pool.length;
}

const HEALTH_CHECK_RETRIES = 3;
const HEALTH_CHECK_DELAY_MS = 2000;

export async function healthCheck(baseURL: string): Promise<void> {
  const modelsURL = `${baseURL}/models`;
  const results = await Promise.all(
    pool.map(async (state, index) => {
      for (let attempt = 1; attempt <= HEALTH_CHECK_RETRIES; attempt++) {
        try {
          const res = await fetch(modelsURL, {
            headers: { Authorization: `Bearer ${state.key}` },
            signal: AbortSignal.timeout(10000),
          });
          if (res.ok) {
            log.success("pool", `${fmtKey(state.key, index)} alive (${res.status})`);
            return true;
          }
          const isQuota = res.status === 429 || res.status === 403;
          if (isQuota) {
            state.disabled = true;
            log.warn("pool", `${fmtKey(state.key, index)} quota exhausted at startup, disabled`);
            return false;
          }
          log.warn("pool", `${fmtKey(state.key, index)} check ${attempt}/${HEALTH_CHECK_RETRIES} failed (${res.status})`);
        } catch (err) {
          log.warn("pool", `${fmtKey(state.key, index)} check ${attempt}/${HEALTH_CHECK_RETRIES} unreachable: ${String(err)}`);
        }
        if (attempt < HEALTH_CHECK_RETRIES) {
          await new Promise((r) => setTimeout(r, HEALTH_CHECK_DELAY_MS));
        }
      }
      state.disabled = true;
      log.error("pool", `${fmtKey(state.key, index)} dead after ${HEALTH_CHECK_RETRIES} checks, disabled`);
      return false;
    }),
  );

  const alive = results.filter(Boolean).length;
  log.info("pool", `Health check: ${alive}/${pool.length} keys alive`);
}

/**
 * Mark a key as exhausted (hit quota). It will be skipped for the
 * configured cooldown duration.
 *
 * @param index - Pool index returned by {@link pick}.
 */
export function markExhausted(index: number): void {
  const state = pool[index];
  if (!state) return;

  const cooldownMs = randomCooldownMs();
  state.exhaustedUntil = Date.now() + cooldownMs;
  log.warn("pool", `${fmtKey(state.key, index)} quota exhausted, cooldown ${fmtMs(cooldownMs)}`);
}

export function earliestRecoveryMs(): number {
  const now = Date.now();
  const candidates = pool.filter((s) => !s.disabled);
  if (candidates.length === 0) return Infinity;
  const earliest = Math.min(...candidates.map((s) => s.exhaustedUntil));
  return Math.max(0, earliest - now);
}

/**
 * Record a successful response for a key.
 *
 * @param index - Pool index returned by {@link pick}.
 */
export function recordSuccess(index: number): void {
  const state = pool[index];
  if (!state) return;

  state.successCount++;
  state.consecutiveErrors = 0;
  state.lastSuccessTime = Date.now();
}

/**
 * Record an error for a key.
 *
 * @param index - Pool index returned by {@link pick}.
 * @param error - Description of the error.
 */
export function recordError(index: number, error: string): void {
  const state = pool[index];
  if (!state) return;

  state.errorCount++;
  state.consecutiveErrors++;
  state.lastError = error;
  state.lastErrorTime = Date.now();
}

/**
 * Determine the health status of a key based on its state.
 */
function getKeyHealthStatus(state: KeyState): KeyHealthStatus {
  if (state.disabled) {
    return "disabled";
  }

  const now = Date.now();

  // Key is in cooldown — exhausted
  if (now < state.exhaustedUntil) {
    return "exhausted";
  }

  // High consecutive errors — failing
  if (state.consecutiveErrors >= 5) {
    return "failing";
  }

  // Some recent errors but still functional — degraded
  if (state.consecutiveErrors > 0) {
    return "degraded";
  }

  return "healthy";
}

/**
 * Get health information for a single key.
 *
 * @returns Health details with key prefix only for safety.
 */
export function getKeyHealth(index: number): {
  index: number;
  key: string;
  status: KeyHealthStatus;
  available: boolean;
  requests: number;
  successes: number;
  errors: number;
  consecutiveErrors: number;
  lastError: string | null;
  lastErrorTime: number | null;
  lastSuccessTime: number | null;
} | null {
  const state = pool[index];
  if (!state) return null;

  const now = Date.now();
  const avail = !state.disabled && now >= state.exhaustedUntil;

  return {
    index,
    key: state.key.slice(0, 8) + "...",
    status: getKeyHealthStatus(state),
    available: avail,
    requests: state.requestCount,
    successes: state.successCount,
    errors: state.errorCount,
    consecutiveErrors: state.consecutiveErrors,
    lastError: state.lastError,
    lastErrorTime: state.lastErrorTime,
    lastSuccessTime: state.lastSuccessTime,
  };
}

/**
 * Get a snapshot of the current key pool status with health info.
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
    status: KeyHealthStatus;
    available: boolean;
    requests: number;
    successes: number;
    errors: number;
    consecutiveErrors: number;
    lastError: string | null;
    lastErrorTime: number | null;
    lastSuccessTime: number | null;
  }>;
} {
  const now = Date.now();
  let available = 0;
  const keys = pool.map((state, index) => {
    const avail = !state.disabled && now >= state.exhaustedUntil;
    if (avail) available++;
    return {
      index,
      key: state.key.slice(0, 8) + "...",
      status: getKeyHealthStatus(state),
      available: avail,
      requests: state.requestCount,
      successes: state.successCount,
      errors: state.errorCount,
      consecutiveErrors: state.consecutiveErrors,
      lastError: state.lastError,
      lastErrorTime: state.lastErrorTime,
      lastSuccessTime: state.lastSuccessTime,
    };
  });
  return { total: pool.length, available, keys };
}
