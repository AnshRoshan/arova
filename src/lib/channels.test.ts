import { test } from "node:test";
import assert from "node:assert/strict";
import { channelEventText, deliverToChannel, isChannelKind, newChannelToken, redactTarget, webhookPayload } from "./channels.ts";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

test("a run line names the agent and the outcome, not a bare status", () => {
  const text = channelEventText({ kind: "run", title: "Inbox briefing", status: "COMPLETED", summary: "3 messages need a reply.", agentName: "Scout" });
  assert.match(text, /Inbox briefing/);
  assert.match(text, /Scout/);
  assert.match(text, /COMPLETED: 3 messages/);
});

test("an approval line says a human decision is required", () => {
  const text = channelEventText({ kind: "approval", title: "Send the report", status: "PENDING", summary: "To the finance channel.", agentName: "Meridian" });
  assert.match(text, /Needs your decision/);
  assert.match(text, /Meridian/);
});

test("Slack gets text only; a generic webhook gets routable metadata", () => {
  const event = { kind: "run" as const, title: "R", status: "COMPLETED", summary: "S", runId: "run-1" };
  assert.deepEqual(Object.keys(webhookPayload("slack", event)), ["text"]);
  const generic = webhookPayload("webhook", event);
  assert.equal(generic.event, "run");
  assert.equal(generic.runId, "run-1");
  assert.equal(generic.status, "COMPLETED");
});

test("a target is redacted to its host, never its token-bearing path", () => {
  assert.equal(redactTarget("https://hooks.slack.com/services/T1/B2/secret"), "hooks.slack.com/…");
  assert.equal(redactTarget("not a url"), "invalid target");
});

test("tokens are long, prefixed, and different every time", () => {
  const a = newChannelToken(), b = newChannelToken();
  assert.match(a, /^arova-ch-[0-9a-f]{48}$/);
  assert.notEqual(a, b);
  assert.ok(isChannelKind("slack"));
  assert.ok(!isChannelKind("email"));
});

test("delivery refuses a non-https target before any request is made", async () => {
  let called = false;
  const result = await deliverToChannel(
    { name: "local", kind: "webhook", target: "http://example.com/hook" },
    { kind: "test", title: "t", status: "TEST", summary: "s" },
    { lookup: publicLookup, fetchImpl: async () => { called = true; return new Response("ok"); } },
  );
  assert.equal(result.status, "REFUSED");
  assert.equal(called, false);
});

test("delivery posts the payload and reports the host, never the URL", async () => {
  const captured = { url: "", body: "" };
  const result = await deliverToChannel(
    { name: "slack", kind: "slack", target: "https://hooks.slack.com/services/T1/B2/secret" },
    { kind: "run", title: "R", status: "COMPLETED", summary: "S" },
    { lookup: publicLookup, fetchImpl: async (url, init) => { captured.url = String(url); captured.body = String(init?.body ?? ""); return new Response("ok", { status: 200 }); } },
  );
  assert.equal(result.ok, true);
  assert.equal(result.status, "DELIVERED");
  assert.equal(captured.url, "https://hooks.slack.com/services/T1/B2/secret");
  assert.deepEqual(JSON.parse(captured.body), { text: "Arova · R\nCOMPLETED: S" });
  assert.ok(!result.detail.includes("secret"));
});

test("a 5xx is retried once and can succeed", async () => {
  let calls = 0;
  const result = await deliverToChannel(
    { name: "hook", kind: "webhook", target: "https://example.com/hook" },
    { kind: "test", title: "t", status: "TEST", summary: "s" },
    { lookup: publicLookup, attempts: 2, retryDelayMs: 0, fetchImpl: async () => { calls++; return new Response(calls === 1 ? "" : "ok", { status: calls === 1 ? 500 : 200 }); } },
  );
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
});

test("a 4xx is a refusal, not a transient failure, so it is not retried", async () => {
  let calls = 0;
  const result = await deliverToChannel(
    { name: "hook", kind: "webhook", target: "https://example.com/hook" },
    { kind: "test", title: "t", status: "TEST", summary: "s" },
    { lookup: publicLookup, retryDelayMs: 0, fetchImpl: async () => { calls++; return new Response("nope", { status: 405 }); } },
  );
  assert.equal(result.status, "FAILED");
  assert.equal(calls, 1);
  assert.match(result.detail, /answered 405/);
});

test("a persistent 5xx is a failure and says how many attempts were made", async () => {
  const result = await deliverToChannel(
    { name: "hook", kind: "webhook", target: "https://example.com/hook" },
    { kind: "test", title: "t", status: "TEST", summary: "s" },
    { lookup: publicLookup, retryDelayMs: 0, fetchImpl: async () => new Response("nope", { status: 500 }) },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, "FAILED");
  assert.match(result.detail, /answered 500 after 2 attempts/);
});

test("a thrown fetch is retried, then reported as a failure rather than an exception", async () => {
  const result = await deliverToChannel(
    { name: "hook", kind: "webhook", target: "https://example.com/hook" },
    { kind: "test", title: "t", status: "TEST", summary: "s" },
    { lookup: publicLookup, retryDelayMs: 0, fetchImpl: async () => { throw new Error("timed out"); } },
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, "FAILED");
  assert.match(result.detail, /did not answer/);
});
