// Phase 1F.9 — tiny in-memory sliding-window rate limiter (pure; unit-tested).
// Best-effort per-process (serverless instances don't share state) — sufficient to blunt
// accidental Enter-spam / abuse on the pilot translate route. Swap for a durable store
// (KV/Redis) before a high-traffic production rollout.

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Record a hit for `key` at time `now` and decide if it's allowed under `max` requests
 * per `windowMs`. Mutates `store` (prunes expired timestamps). Deterministic given inputs.
 */
export function checkRateLimit(
  store: Map<string, number[]>,
  key: string,
  now: number,
  max: number,
  windowMs: number,
): RateLimitDecision {
  const recent = (store.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= max) {
    store.set(key, recent);
    const oldest = recent[0] ?? now;
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, windowMs - (now - oldest)) };
  }

  recent.push(now);
  store.set(key, recent);
  return { allowed: true, remaining: max - recent.length, retryAfterMs: 0 };
}
