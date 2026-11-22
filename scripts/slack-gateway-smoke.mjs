/**
 * Slack gateway smoke test (spec 21b) — run with a fresh cookie jar, mocks up: Assumes a fresh workspace cookie in
 * %TEMP%/arova-cookies.txt and the mock Slack on :3103. Creates agent/team/connection via the
 * board API, then fires signed webhooks and asserts every rule of the spec.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const TMP = process.env.TEMP.replace(/\\/g, "/");
const cookie = readFileSync(`${TMP}/arova-cookies.txt`, "utf8")
  .split("\n").find((l) => l.includes("arova_workspace") && !l.startsWith("#"))?.split("\t").pop()?.trim()
  ?? readFileSync(`${TMP}/arova-cookies.txt`, "utf8")
    .split("\n").find((l) => l.includes("arova_workspace"))?.split("\t").pop()?.trim();
const jar = cookie ? `Cookie: arova_workspace=${cookie}` : "";

async function board(action, payload = {}) {
  const r = await fetch("http://localhost:3222/api/board", {
    method: "POST", headers: { "content-type": "application/json", cookie: jar.replace("Cookie: ", "") },
    body: JSON.stringify({ action, ...payload }),
  });
  return { status: r.status, json: await r.json() };
}
async function getBoard() {
  const r = await fetch("http://localhost:3222/api/board", { headers: { cookie: jar.replace("Cookie: ", "") } });
  return r.json();
}

// Idempotent setup: reuse whatever a previous run already created.
const before = await getBoard();
let teamId = before.teams.find((t) => t.name === "GatewayLab")?.id;
if (!teamId) {
  const team = await board("createEmptyTeam", { name: "GatewayLab" });
  teamId = (team.json.board ?? team.json).teams.find((t) => t.name === "GatewayLab").id;
}
let agentId = before.agents.find((a) => a.name === "Anchor")?.id;
if (!agentId) {
  const agent = await board("createAgent", { name: "Anchor", role: "Lead" });
  if (!agent.json.agentId) { console.log("FAIL createAgent:", agent.json.error); process.exit(1); }
  agentId = agent.json.agentId;
}
await board("assignAgent", { agentId, teamId });
const now = await getBoard();
const existingConnection = (now.channels ?? []).find((c) => c.name === "company-slack");
if (existingConnection) await board("revokeChannelConnection", { connectionId: existingConnection.id });
const conn = await board("createChannelConnection", {
  kind: "slack", name: "company-slack", botToken: "xoxb-mock-test-token", signingSecret: "test-signing-secret",
  externalId: "T-TEST", teamId, allowedSenders: ["U-ALLOWED"],
});
if (!conn.json.connectionId) { console.log("FAIL createChannelConnection:", conn.json.error); process.exit(1); }
const fullBoard = (conn.json.board ?? conn.json);
const leaked = JSON.stringify(fullBoard).includes("xoxb-mock") || JSON.stringify(fullBoard).includes("test-signing-secret");
console.log("setup ok | secrets leaked to board:", leaked);

const SECRET = "test-signing-secret";
const sign = (body) => {
  const ts = String(Math.floor(Date.now() / 1000));
  return { ts, sig: `v0=${createHmac("sha256", SECRET).update(`v0:${ts}:${body}`).digest("hex")}` };
};
async function webhook(body, headers = {}) {
  const r = await fetch("http://localhost:3222/api/channels/slack", {
    method: "POST",
    headers: { "content-type": "application/json", "x-slack-request-timestamp": headers.ts ?? "", "x-slack-signature": headers.sig ?? "" },
    body,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

// 1. url_verification — signed, echoes the challenge
const challenge = JSON.stringify({ type: "url_verification", team_id: "T-TEST", challenge: "ch_abc123" });
const c = sign(challenge);
const urlVerify = await webhook(challenge, c);
console.log("challenge echoed:", urlVerify.json.challenge === "ch_abc123", "| status:", urlVerify.status);

// 2. A mention from an allowed sender → 202 queued
const e1 = JSON.stringify({ event_id: "EVT-y6m9y-1", team_id: "T-TEST", event: { type: "app_mention", channel: "C1", user: "U-ALLOWED", text: "<@UAPP> brief the team on the launch" } });
const s1 = sign(e1);
const first = await webhook(e1, s1);
console.log("allowed mention queued:", first.status === 202 && first.json.queued === true, "| jobId:", Boolean(first.json.jobId));

// 3. The same event id → duplicate, never a second brief
const dup = await webhook(e1, s1);
console.log("duplicate ignored:", dup.json.duplicate === true);

// 4. A stranger → refused
const e2 = JSON.stringify({ event_id: "EVT-y6m9y-2", team_id: "T-TEST", event: { type: "app_mention", channel: "C1", user: "U-STRANGER", text: "<@UAPP> do things" } });
const s2 = sign(e2);
const stranger = await webhook(e2, s2);
console.log("stranger refused:", stranger.json.refused !== undefined && stranger.status === 200);

// 5. A tampered body → 401 before anything runs
const tampered = JSON.stringify({ event_id: "EVT-y6m9y-3", team_id: "T-TEST", event: { type: "app_mention", channel: "C1", user: "U-ALLOWED", text: "evil" } });
const bad = await webhook(tampered, s1);
console.log("tampered body 401:", bad.status === 401);

// 6. Unknown workspace id → 404
const unknown = JSON.stringify({ event_id: "EVT-y6m9y-4", team_id: "T-NOWHERE", event: { type: "app_mention", channel: "C1", user: "U-ALLOWED", text: "x" } });
const s4 = sign(unknown);
const nf = await webhook(unknown, s4);
console.log("unknown connection 404:", nf.status === 404);

// 7. The queued brief: start the worker and check the mock Slack got a threaded report
console.log("now start `npm run worker` in another shell; then check http://127.0.0.1:3103/_posted");
