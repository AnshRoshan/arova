/**
 * Live proof that stopping an org brief stops the summons: the reader leaves while a seat is
 * answering, the seat's model call is aborted at the provider, the channel says the brief was
 * stopped, and the run is CANCELLED instead of being completed or blamed on the provider.
 *
 *   node .impeccable/tool-loop-fixture.mjs
 *   PROVIDERS=fixture ... npm run dev
 *   node .impeccable/brief-stop-proof.mjs
 */
import assert from "node:assert/strict";

const BASE = process.env.AROVA_BASE ?? "http://localhost:3000";
const FIXTURE = process.env.FIXTURE_BASE ?? "http://127.0.0.1:8788";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

await fetch(`${FIXTURE}/stats/reset`, { method: "POST" });
const init = await fetch(`${BASE}/api/board`);
const cookie = (init.headers.get("set-cookie") ?? "").split(";")[0];
assert.ok(cookie, "a workspace cookie is required");
const headers = { cookie, "content-type": "application/json" };
const act = async (action, payload) => {
  const response = await fetch(`${BASE}/api/board`, { method: "POST", headers, body: JSON.stringify({ action, ...payload }) });
  const body = await response.json().catch(() => ({}));
  assert.equal(response.status, 200, `${action} -> ${response.status} ${body.error ?? ""}`);
  return body;
};

const team = await act("createEmptyTeam", { name: "Briefstop", brief: "Tests that a stopped brief stays stopped." });
const teamName = team.team?.name ?? "Briefstop";
const teamId = team.team?.id ?? team.teamId;
const lead = await act("createAgent", { name: "Ledger", role: "lead", teamId });
const peer = await act("createAgent", { name: "Vela", role: "writer", teamId });
const leadId = lead.agent?.id ?? lead.agentId;
await act("assignOrgLead", { teamId, agentId: leadId });

const controller = new AbortController();
const response = await fetch(`${BASE}/api/board`, {
  method: "POST",
  headers,
  body: JSON.stringify({ action: "briefOrg", teamId, content: "Ask Vela what she thinks about the launch.", stream: true }),
  signal: controller.signal,
});
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let sawConsult = false;
let sawReport = false;
try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find(l => l.startsWith("data: "));
      if (!line) continue;
      let event;
      try { event = JSON.parse(line.slice(6)); } catch { continue; }
      if (event.type === "consult") { sawConsult = true; controller.abort(); }
      if (event.type === "delta") sawReport = true;
    }
  }
} catch (error) {
  if (error?.name !== "AbortError") throw error;
}
assert.equal(sawConsult, true, "the brief reached a seat, so there was work to stop");
assert.equal(sawReport, false, "no report streamed after the stop");

await sleep(3000);
const stats = await (await fetch(`${FIXTURE}/stats`)).json();
const board = await (await fetch(`${BASE}/api/board`, { headers: { cookie } })).json();
const channel = board.messages.filter(message => message.teamId === teamId);
const stopRow = channel.find(message => message.metadata?.stopped === true);
const peerPosts = channel.filter(message => message.kind === "channel_post");
const summaries = channel.filter(message => message.kind === "channel_summary");
const errors = channel.filter(message => message.kind === "provider_error");
const briefRun = board.runs.find(run => String(run.title ?? "") === `Brief · ${teamName}`);
const stopAudit = board.events.filter(event => event.agentId === leadId && event.type === "brief.stopped");

assert.ok(stopRow, "the channel says the brief was stopped");
assert.match(stopRow.content, /stopped before/i, "the row says the brief was stopped before it finished");
assert.deepEqual(peerPosts, [], "the aborted seat posted nothing");
assert.deepEqual(summaries, [], "no report was written after the stop");
assert.deepEqual(errors, [], "a stop is not stored as a provider failure");
assert.equal(briefRun?.status, "CANCELLED", "the run is CANCELLED, not COMPLETED or FAILED");
assert.equal(stopAudit.length, 1, "the audit records the stop");
assert.ok(stats.aborted >= 1, "the seat's call in flight was aborted at the provider");

console.log(JSON.stringify({
  workspace: board.workspace.id,
  teamId,
  fixture: stats,
  stopRow: stopRow.content,
  runStatus: briefRun?.status,
  stopAudit: stopAudit.map(event => event.detail),
  peer: peer.agent?.name ?? peer.agentId,
}, null, 2));
console.log("PASS stop stops the org brief");
