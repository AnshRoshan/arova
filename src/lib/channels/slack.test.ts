import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parseAppMention, senderAllowed, slackApiBase, verifySlackSignature } from "./slack.ts";

/**
 * Spec 21b — the Slack adapter's pure core. Every webhook is untrusted until its signature
 * verifies against the connection's own secret, within a fresh timestamp window.
 */

const SECRET = "test-signing-secret";
const sign = (body: string, timestamp: number) =>
  `v0=${createHmac("sha256", SECRET).update(`v0:${timestamp}:${body}`).digest("hex")}`;

test("a correctly signed, fresh request verifies", () => {
  const now = 1_800_000_000_000;
  const ts = String(Math.floor(now / 1000));
  const body = JSON.stringify({ team_id: "T1", event_id: "E1" });
  assert.equal(verifySlackSignature(SECRET, { timestamp: ts, signature: sign(body, Number(ts)) }, body, now), true);
});

test("an old timestamp is refused even when the signature is valid — replays die here", () => {
  const now = 1_800_000_000_000;
  const stale = String(Math.floor(now / 1000) - 600);
  const body = "{}";
  assert.equal(verifySlackSignature(SECRET, { timestamp: stale, signature: sign(body, Number(stale)) }, body, now), false);
  assert.equal(verifySlackSignature(SECRET, { timestamp: "garbage", signature: sign(body, 1) }, body, now), false);
});

test("a tampered body or wrong secret never verifies", () => {
  const now = 1_800_000_000_000;
  const ts = String(Math.floor(now / 1000));
  assert.equal(verifySlackSignature(SECRET, { timestamp: ts, signature: sign("different body", Number(ts)) }, "{}", now), false);
  assert.equal(verifySlackSignature("other-secret", { timestamp: ts, signature: sign("{}", Number(ts)) }, "{}", now), false);
  assert.equal(verifySlackSignature(SECRET, { timestamp: ts, signature: "" }, "{}", now), false);
});

test("an app_mention parses to its thread identity; other events are not briefs", () => {
  const event = parseAppMention({
    event_id: "Ev1", team_id: "T1",
    event: { type: "app_mention", channel: "C1", thread_ts: "123.456", user: "U9", text: "<@UOB> brief the team on the launch" },
  });
  assert.deepEqual(event, { eventId: "Ev1", teamId: "T1", channelId: "C1", threadTs: "123.456", userId: "U9", text: "brief the team on the launch" });
  assert.equal(parseAppMention({ event_id: "Ev2", team_id: "T1", event: { type: "message", channel: "C1", user: "U9", text: "hi" } }), null);
  assert.equal(parseAppMention({ event: { type: "app_mention" } }), null);
});

test("the sender allow-list is exact and is the identity boundary", () => {
  assert.equal(senderAllowed(["U1", "U2"], "U1"), true);
  assert.equal(senderAllowed(["U1"], "U9"), false);
  assert.equal(senderAllowed([], "U1"), false, "an empty allow-list admits nobody");
});

test("the API base is overridable so the adapter can be verified against a mock", () => {
  assert.equal(slackApiBase({ SLACK_API_BASE: "http://127.0.0.1:3103" }), "http://127.0.0.1:3103");
  assert.equal(slackApiBase({}), "https://slack.com/api");
});
