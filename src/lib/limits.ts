/**
 * Spec 19e — the single-instance, in-memory sliding-window limiter. Documented limitation: it
 * guards one process, not a fleet; a multi-instance deployment moves the window into Postgres or
 * Redis (recorded in the spec, decided not built).
 */
export type RateLimitVerdict = { ok: true } | { ok: false; retryAfterMs: number };

export function makeRateLimiter(clock: () => number, window: { capacity: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  return {
    hit(key: string): RateLimitVerdict {
      const now = clock();
      const previous = (hits.get(key) ?? []).filter((at) => now - at < window.windowMs);
      if (previous.length >= window.capacity) {
        return { ok: false, retryAfterMs: window.windowMs - (now - previous[0]) };
      }
      previous.push(now);
      hits.set(key, previous);
      return { ok: true };
    },
  };
}
