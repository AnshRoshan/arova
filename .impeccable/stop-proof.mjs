/**
 * Live proof that Stop stops the work: the reader leaves during a tool loop, the model call in
 * flight is aborted at the provider (the fixture says so), nothing is stored as an answer, and the
 * thread records that the reader stopped it.
 *
 *   node .impeccable/tool-loop-fixture.mjs         (fixture with /stats and a 1200 ms loop turn)
 *   PROVIDERS=fixture ... npm run dev
 *   node .impeccable/stop-proof.mjs
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

const created = await act("createAgent", { name: "Stoppy", role: "researcher", capabilities: { toolLoop: true } });
const agentId = created.agent?.id ?? created.agentId;
assert.ok(agentId, "the agent was created");

const controller = new AbortController();
const response = await fetch(`${BASE}/api/board`, {
  method: "POST",
  headers,
  body: JSON.stringify({ action: "sendMessage", agentId, content: "Research Arova and cite what you find.", stream: true }),
  signal: controller.signal,
});
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let sawTool = false;
let sawDelta = false;
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
      if (event.type === "delta") sawDelta = true;
      if (event.type === "tool" && !sawTool) { sawTool = true; controller.abort(); }
    }
  }
} catch (error) {
  if (error?.name !== "AbortError") throw error;
}
assert.equal(sawTool, true, "a tool event arrived, so the loop was really under way");
assert.equal(sawDelta, false, "the answer never streamed, because the reader left first");

await sleep(2600);
const stats = await (await fetch(`${FIXTURE}/stats`)).json();
const board = await (await fetch(`${BASE}/api/board`, { headers: { cookie } })).json();
const assistant = board.messages.filter(message => message.agentId === agentId && message.role === "assistant");
const stoppedAudit = board.events.filter(event => event.agentId === agentId && event.type === "chat.stopped");

assert.equal(assistant.length, 1, "only the greeting is stored — no cancelled answer and no invented provider failure");
assert.ok(!assistant.some(message => /Arova is a workspace|provider error|Provider returned/i.test(message.content)), "a stopped loop stores neither an answer nor a fake error");
assert.equal(stoppedAudit.length, 1, "the record says the reader stopped it");
assert.ok(stats.aborted >= 1, "the model call in flight was aborted at the provider, not left to finish");
assert.ok(stats.calls <= 4, `no extra turn was bought after the stop (calls: ${stats.calls})`);

console.log(JSON.stringify({
  workspace: board.workspace.id,
  agentId,
  fixture: stats,
  storedReplies: assistant.map(message => message.content.slice(0, 60)),
  stoppedAudit: stoppedAudit.map(event => event.detail),
  callsToday: board.limits?.dailyModelCalls,
}, null, 2));
console.log("PASS stop stops the tool loop");
