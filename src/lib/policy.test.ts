import { test } from "node:test";
import assert from "node:assert/strict";
import { argumentsHash, approvalExpiry, assertFetchableUrl, decideToolCall, hashToken, tokenPreview, tokenVerdict, canPropose, parseAllowlist, truncateOutput, UNATTENDED_CAP } from "./policy.ts";

/**
 * Spec 26g/26 (2026-10-25 amendments) — the approval token's rules, kept pure: an approval authorizes
 * one action, expires, and cannot be reused; the hash binds the token to the exact arguments; the
 * autonomy dial bounds what unattended work may decide on its own.
 */

test("argumentsHash is stable for the same arguments and differs for any change", () => {
  const a = { target: "https://example.com/api", method: "POST" };
  const h = argumentsHash(a);
  assert.equal(h, argumentsHash({ method: "POST", target: "https://example.com/api" }), "key order must not change the hash");
  assert.notEqual(h, argumentsHash({ ...a, method: "GET" }));
  assert.notEqual(h, argumentsHash({ ...a, target: "https://example.com/api/" }));
  assert.equal(h.length, 64, "sha-256 hex");
});

test("an unattended approval expires in ten minutes; an interactive one lives one session", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  assert.equal(approvalExpiry(now, false).toISOString(), "2026-10-25T12:10:00.000Z");
  assert.equal(approvalExpiry(now, true).toISOString(), "2026-10-25T12:00:00.000Z", "interactive approvals are consumed at once, so they expire immediately");
});

test("a token is consumable exactly once, before expiry, for the matching hash and target", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const token = { expiresAt: "2026-10-25T12:10:00Z", consumedAt: null as string | null, argumentsHash: argumentsHash({ a: 1 }), target: "https://x.test" };
  assert.deepEqual(tokenVerdict(token, { hash: token.argumentsHash, target: token.target, now }), { ok: true });
  assert.equal(tokenVerdict(token, { hash: argumentsHash({ a: 2 }), target: token.target, now }).ok, false, "different arguments never match");
  assert.equal(tokenVerdict(token, { hash: token.argumentsHash, target: "https://y.test", now }).ok, false, "a different target is not this approval");
  assert.equal(tokenVerdict(token, { hash: token.argumentsHash, target: token.target, now: new Date("2026-10-25T12:10:01Z") }).ok, false, "expired");
  assert.equal(
    tokenVerdict({ ...token, consumedAt: "2026-10-25T12:01:00Z" }, { hash: token.argumentsHash, target: token.target, now }).ok,
    false,
    "a consumed token is dead, even inside its window",
  );
});

test("the refusal names the reason, never a bare false", () => {
  const token = { expiresAt: "2026-10-25T12:10:00Z", consumedAt: "2026-10-25T12:01:00Z" as string | null, argumentsHash: "h", target: "t" };
  const reason = (t: typeof token, use: { hash: string; target: string; now: Date }) => { const v = tokenVerdict(t, use); return v.ok ? "ok" : v.reason; };
  assert.equal(reason(token, { hash: "h", target: "t", now: new Date("2026-10-25T12:02:00Z") }), "consumed");
  assert.equal(reason({ ...token, consumedAt: null }, { hash: "h", target: "t", now: new Date("2026-10-25T12:11:00Z") }), "expired");
  assert.equal(reason({ ...token, consumedAt: null }, { hash: "other", target: "t", now: new Date("2026-10-25T12:02:00Z") }), "arguments");
  assert.equal(reason({ ...token, consumedAt: null }, { hash: "h", target: "other", now: new Date("2026-10-25T12:02:00Z") }), "target");
});

test("the autonomy dial: unattended work always plays by the standard rules, whatever the dial says", () => {
  assert.equal(canPropose("high", true), false, "a high dial never removes the unattended cap");
  assert.equal(canPropose("high", false), true, "interactive high may chain bounded self-corrections");
  assert.equal(canPropose("standard", false), false, "standard requires confirmation at step boundaries");
  assert.equal(canPropose("low", false), false);
});

test("the unattended cap is one model call until a budget row says otherwise", () => {
  assert.equal(UNATTENDED_CAP, 1);
});

test("a bearer token is stored only as a digest; the preview recognises without replaying", () => {
  const raw = "arova-abc123def456";
  const digest = hashToken(raw);
  assert.equal(digest, hashToken(raw), "stable");
  assert.notEqual(digest, raw, "the digest is not the token");
  assert.equal(digest.length, 64);
  const preview = tokenPreview(raw);
  assert.ok(preview.startsWith("arova-ab") && preview.endsWith("f456"));
  assert.ok(!preview.includes("c123de"), "the middle never appears in the preview");
});

/**
 * Spec 17b — the policy gateway's decision matrix. Fail-closed: missing policy permits nothing,
 * and a denial always names the rule. Spec 17's own unit list: policy allow/deny matrix, SSRF
 * host checks, output truncation.
 */

const allow = { allowedHosts: ["example.com"] as string[] | null };

test("a granted read tool in act mode is allowed", () => {
  assert.deepEqual(decideToolCall({ tool: "web_fetch", risk: "READ", granted: true, permissionMode: "act", unattended: false, ...allow }, { target: "https://example.com/x" }), { decision: "allow", rule: "granted read" });
});

test("an ungranted tool is denied before anything else is consulted", () => {
  assert.deepEqual(decideToolCall({ tool: "web_fetch", risk: "READ", granted: false, permissionMode: "act", unattended: false, ...allow }, { target: "https://example.com/x" }), { decision: "deny", rule: "not granted" });
});

test("plan mode denies every non-read tool and says so", () => {
  assert.deepEqual(decideToolCall({ tool: "write_file", risk: "WRITE", granted: true, permissionMode: "plan", unattended: false, ...allow }, {}), { decision: "deny", rule: "plan mode" });
  assert.deepEqual(decideToolCall({ tool: "web_fetch", risk: "READ", granted: true, permissionMode: "plan", unattended: false, ...allow }, { target: "https://example.com/x" }).decision, "allow", "reads still work in plan mode");
});

test("a write always asks for approval in v1 — interactive or not", () => {
  assert.deepEqual(decideToolCall({ tool: "mcp:calendar.create", risk: "WRITE", granted: true, permissionMode: "act", unattended: false, ...allow }, {}), { decision: "approval", rule: "write requires approval" });
});

test("unattended work can neither auto-approve nor run external writes — it is capped at reads", () => {
  assert.deepEqual(decideToolCall({ tool: "mcp:x", risk: "WRITE", granted: true, permissionMode: "act", unattended: true, ...allow }, {}), { decision: "deny", rule: "unattended work cannot approve writes" });
  assert.deepEqual(decideToolCall({ tool: "mcp:x", risk: "EXTERNAL", granted: true, permissionMode: "act", unattended: true, allowedHosts: null }, {}), { decision: "deny", rule: "unattended work cannot approve writes" });
});

test("an unannotated MCP tool defaults to approval — the safe rule", () => {
  assert.deepEqual(decideToolCall({ tool: "mcp:unknown_thing", risk: "WRITE", granted: true, permissionMode: "act", unattended: false, ...allow }, {}), { decision: "approval", rule: "write requires approval" });
});

test("an annotated read-only MCP tool runs on its grant, like any read", () => {
  assert.deepEqual(decideToolCall({ tool: "mcp:ops:get_status", risk: "READ", granted: true, permissionMode: "act", unattended: false, allowedHosts: null }, {}), { decision: "allow", rule: "granted read" });
  assert.deepEqual(decideToolCall({ tool: "mcp:ops:get_status", risk: "READ", granted: false, permissionMode: "act", unattended: false, allowedHosts: null }, {}), { decision: "deny", rule: "not granted" }, "the seat must still hold the server");
});

test("a pre-approved internal write runs on its grant; external reach never does", () => {
  assert.deepEqual(decideToolCall({ tool: "save_note", risk: "WRITE", granted: true, permissionMode: "act", unattended: false, allowedHosts: null, preApproved: true }, {}), { decision: "allow", rule: "pre-approved by grant" });
  assert.deepEqual(decideToolCall({ tool: "mcp:post", risk: "EXTERNAL", granted: true, permissionMode: "act", unattended: false, allowedHosts: null, preApproved: true }, {}), { decision: "approval", rule: "write requires approval" }, "a grant cannot pre-approve the outside world");
});

test("an external read against a host outside the allow-list is denied, not asked", () => {
  assert.deepEqual(decideToolCall({ tool: "web_fetch", risk: "READ", granted: true, permissionMode: "act", unattended: false, allowedHosts: ["example.com"] }, { target: "https://other.net/x" }), { decision: "deny", rule: "host is not on this deployment's allow-list (TOOL_ALLOWED_HOSTS)" });
});

test("SSRF: private networks, loopback and cloud metadata are refused with the rule named", () => {
  for (const bad of [
    "http://127.0.0.1/x", "http://localhost/x", "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.1/x", "http://192.168.1.1/x", "http://172.16.0.1/x", "http://[::1]/x",
    "http://0.0.0.0/x", "file:///etc/passwd", "ftp://example.com/x",
  ]) {
    assert.throws(() => assertFetchableUrl(bad, null), /./, bad);
  }
  assert.throws(() => assertFetchableUrl("https://metadata.google.internal/computeMetadata/v1/", null), /metadata/i);
});

test("SSRF: an allow-list holds even for public hosts, and a match is exact-or-subdomain", () => {
  const url = assertFetchableUrl("https://api.example.com/v1/x", ["example.com"]);
  assert.equal(url.hostname, "api.example.com");
  assert.throws(() => assertFetchableUrl("https://notexample.com/", ["example.com"]), /allow-list/);
  assert.throws(() => assertFetchableUrl("https://example.com.evil.test/", ["example.com"]), /allow-list/);
  // no allow-list configured → public hosts are still fetchable, private ones never are
  assertFetchableUrl("https://example.com/", null);
  assert.throws(() => assertFetchableUrl("http://127.0.0.1/", null), /private/i);
});

test("output is truncated with an honest marker, never silently", () => {
  assert.equal(truncateOutput("short", 100), "short");
  const big = "x".repeat(1000);
  assert.equal(truncateOutput(big, 100), `${"x".repeat(100)}\n[truncated: 1000 chars, showing 100]`);
});

test('the allow-list parses hosts out of whatever the operator wrote', () => {
  assert.deepEqual(parseAllowlist('example.com, api.other.test'), ['example.com', 'api.other.test']);
  assert.deepEqual(parseAllowlist('https://Example.com/path'), ['example.com']);
  assert.deepEqual(parseAllowlist(undefined), []);
  assert.deepEqual(parseAllowlist('   '), []);
});
