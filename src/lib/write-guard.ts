/**
 * Write-path guards for POST /api/board — the queue item that said "rate limiting + CSRF".
 *
 * The session and workspace cookies are SameSite=Lax, which already stops a cross-site FORM from
 * carrying them; this adds the belt: a browser POST always names its origin, so an Origin that is
 * not this host is refused outright. A missing Origin is a non-browser client (the audit driver,
 * curl), which the cookie requirement still governs.
 *
 * The bucket is per-process and per-workspace: it exists to stop one runaway tab or script from
 * spending the day's model budget in seconds, not to be a distributed rate limiter. That honest
 * scope is why it lives in memory and why the sentence it returns says so.
 */

export function sameOrigin(originHeader: string | null, requestHost: string): boolean {
  if (!originHeader) return true;
  try {
    const o = new URL(originHeader);
    return o.host === requestHost;
  } catch {
    return false;
  }
}

export type Bucket = { tokens: number; updated: number };
export type BucketRule = { burst: number; perMinute: number };

export function allowWrite(buckets: Map<string, Bucket>, key: string, rule: BucketRule, now = Date.now()): { ok: true } | { ok: false; retrySeconds: number } {
  const current = buckets.get(key) ?? { tokens: rule.burst, updated: now };
  const refill = ((now - current.updated) / 60_000) * rule.perMinute;
  const tokens = Math.min(rule.burst, current.tokens + refill);
  if (tokens < 1) {
    buckets.set(key, { tokens, updated: now });
    return { ok: false, retrySeconds: Math.max(1, Math.ceil(((1 - tokens) / rule.perMinute) * 60)) };
  }
  buckets.set(key, { tokens: tokens - 1, updated: now });
  return { ok: true };
}
