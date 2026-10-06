import { test } from "node:test";
import assert from "node:assert/strict";
import { allowWrite, sameOrigin, type Bucket } from "./write-guard.ts";

test("sameOrigin: a browser POST must name this host; a non-browser client names nothing", () => {
  assert.equal(sameOrigin(null, "localhost:3000"), true, "curl and the audit driver send no Origin; the cookie still governs them");
  assert.equal(sameOrigin("http://localhost:3000", "localhost:3000"), true);
  assert.equal(sameOrigin("http://evil.example", "localhost:3000"), false);
  assert.equal(sameOrigin("http://localhost:3000.evil.example", "localhost:3000"), false, "a suffix trick is not a match");
  assert.equal(sameOrigin("not a url", "localhost:3000"), false, "a malformed Origin is refused, not parsed generously");
});

test("allowWrite: burst first, then a steady per-minute refill, and a wait the caller can state", () => {
  const buckets = new Map<string, Bucket>();
  const rule = { burst: 3, perMinute: 60 };
  for (let i = 0; i < 3; i++) assert.deepEqual(allowWrite(buckets, "ws", rule, 1_000), { ok: true });
  const denied = allowWrite(buckets, "ws", rule, 1_000);
  assert.equal(denied.ok, false);
  assert.ok(denied.ok === false && denied.retrySeconds >= 1);
  assert.deepEqual(allowWrite(buckets, "ws", rule, 2_000), { ok: true }, "one second at 60/min is one token back");
  assert.deepEqual(allowWrite(buckets, "other-ws", rule, 2_000), { ok: true }, "buckets are per workspace, not global");
});

test("allowWrite: the bucket caps at the burst, so quiet time cannot bank an hour of writes", () => {
  const buckets = new Map<string, Bucket>();
  const rule = { burst: 5, perMinute: 60 };
  allowWrite(buckets, "ws", rule, 0);
  let allowed = 0;
  for (let i = 0; i < 20; i++) if (allowWrite(buckets, "ws", rule, 600_000 + i).ok) allowed++;
  assert.equal(allowed, rule.burst, "exactly the burst, no more, after a long idle");
});
