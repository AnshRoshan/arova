/**
 * End-to-end API sweep: every action the UI can send, exercised against a real server and a real
 * Postgres, asserting that the change is visible in the board payload the browser would receive.
 *
 *   node .impeccable/api-sweep.mjs [base]
 *
 * Runs in its own anonymous workspace (fresh cookie) and leaves that workspace empty again.
 * Exit code 0 means every step passed.
 */
const BASE = process.argv[2] ?? "http://localhost:3000";
const COOKIE = "arova_workspace";
let jar = "";

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function http(method, path, body, headers = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(jar ? { cookie: jar } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const c of r.headers.getSetCookie?.() ?? []) {
    const kv = c.split(";")[0];
    if (kv.startsWith(COOKIE + "=")) jar = kv;
  }
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: r.status, json };
}

async function act(action, payload = {}, headers = {}) {
  const r = await http("POST", "/api/board", { action, ...payload }, headers);
  const ok = r.status === 200 && r.json?.ok === true;
  return { ...r, ok, error: r.json?.error ?? null, board: r.json?.board ?? null };
}

async function step(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail ?? "");
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

function must(cond, message) { if (!cond) throw new Error(message); }

function seat(board, id) { return (board?.agents ?? []).find(a => a.id === id); }

const fresh = await http("GET", "/api/board");
must(fresh.status === 200, `board GET returned ${fresh.status}`);
must(jar, "no workspace cookie was set");
let board = fresh.json;
const ws = board.workspace.id;
record("GET /api/board boots a workspace", true, `${board.workspace.name} · ${ws.slice(0, 8)}`);
record("board payload shape", ["agents", "messages", "routines", "runs", "approvals", "memories", "channels", "teams", "triggers", "sandbox", "overview"].every(k => k in board), Object.keys(board).length + " keys");

let agentId, secondId, teamId, routineId, memoryId, channelId, evalTaskId, triggerId, runId, toolRunId;

await step("createAgent", async () => {
  const r = await act("createAgent", { name: "Sweep Seat", role: "Researcher", instructions: "Answer briefly." });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  board = r.board;
  const a = board.agents.find(x => x.name === "Sweep Seat");
  must(a, "agent missing from board after create");
  agentId = a.id;
  must(board.messages.some(m => m.agentId === agentId && m.role === "assistant"), "welcome message was not stored");
  return agentId.slice(0, 8);
});

await step("updateAgent", async () => {
  const r = await act("updateAgent", { agentId, role: "Analyst", status: "PAUSED" });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  must(seat(r.board, agentId)?.role === "Analyst", "role did not change");
  must(seat(r.board, agentId)?.status === "PAUSED", "status did not change");
  const back = await act("updateAgent", { agentId, status: "ACTIVE" });
  must(back.ok, back.error);
});

await step("createEmptyTeam", async () => {
  const r = await act("createEmptyTeam", { name: "Sweep Org", brief: "A sweep organisation." });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  teamId = r.json.teamId;
  must(r.board.teams.some(t => t.id === teamId), "team missing from board");
  return teamId.slice(0, 8);
});

await step("assignAgent", async () => {
  const r = await act("assignAgent", { agentId, teamId });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  must(seat(r.board, agentId)?.teamId === teamId, "agent not seated in the team");
});

await step("assignOrgLead", async () => {
  const r = await act("assignOrgLead", { teamId, agentId });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  must(r.board.teams.find(t => t.id === teamId)?.leadAgentId === agentId, "lead not recorded");
});

await step("saveMemory", async () => {
  const r = await act("saveMemory", { teamId, text: "Sweep rule: answer in one sentence.", kind: "decision" });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  memoryId = r.json.memoryId;
  must(r.board.memories.some(m => m.id === memoryId && m.teamId === teamId), "memory missing from board");
});

await step("updateMemory", async () => {
  const r = await act("updateMemory", { memoryId, pinned: true });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  must(r.board.memories.find(m => m.id === memoryId)?.pinned === true, "pin did not stick");
});

await step("createRoutine", async () => {
  const r = await act("createRoutine", { agentId, name: "Sweep heartbeat", description: "Say hello.", schedule: "every 6 hours" });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  const routine = r.board.routines.find(x => x.name === "Sweep heartbeat");
  must(routine, "routine missing from board");
  routineId = routine.id;
  must(routine.nextRunAt, "routine has no next run time");
});

await step("toggleRoutine off/on", async () => {
  const off = await act("toggleRoutine", { routineId });
  must(off.ok, off.error);
  must(off.board.routines.find(r => r.id === routineId)?.enabled === false, "routine stayed enabled");
  const on = await act("toggleRoutine", { routineId });
  must(on.ok, on.error);
  must(on.board.routines.find(r => r.id === routineId)?.enabled === true, "routine did not re-enable");
});

await step("runRoutine (local provider)", async () => {
  const r = await act("runRoutine", { routineId }, { "Idempotency-Key": crypto.randomUUID() });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  runId = r.json.runId;
  must(runId, "no run id returned");
  const run = r.board.runs.find(x => x.id === runId);
  must(run, "run missing from board");
  must(["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(run.status), `run still ${run.status}`);
  const steps = r.board.steps.filter(s => s.runId === runId);
  must(steps.length > 0, "run recorded no steps");
  return `${run.status} · ${steps.length} step(s)`;
});

await step("idempotency key collapses a retry", async () => {
  const key = crypto.randomUUID();
  const first = await act("runRoutine", { routineId }, { "Idempotency-Key": key });
  must(first.ok, first.error);
  const second = await act("runRoutine", { routineId }, { "Idempotency-Key": key });
  must(second.ok, second.error);
  must(first.json.runId === second.json.runId, "a retry created a second run");
});

await step("cancelRun refuses a finished run", async () => {
  const r = await act("cancelRun", { runId });
  must(!r.ok, "cancelling a finished run was accepted");
  must(/finished/i.test(r.error ?? ""), `unexpected error: ${r.error}`);
});

await step("sendMessage (non-stream)", async () => {
  const r = await act("sendMessage", { agentId, content: "Say one line.", stream: false });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  const thread = r.board.messages.filter(m => m.agentId === agentId);
  must(thread.filter(m => m.role === "user").length >= 1, "user message not stored");
  must(thread.filter(m => m.role === "assistant").length >= 2, "assistant reply not stored");
  return thread.findLast?.(m => m.role === "assistant")?.content?.slice(0, 60) ?? "";
});

await step("createChannel", async () => {
  const r = await act("createChannel", { name: "Sweep hook", kind: "webhook", target: "https://example.com/hook" });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  channelId = r.json.channelId;
  must(r.json.token, "channel has no inbound token");
  const row = r.board.channels.find(c => c.id === channelId);
  must(row, "channel missing from board");
  must(!String(row.target ?? "").includes("/hook"), "the board leaked the channel path");
});

await step("testChannel records a delivery", async () => {
  const r = await act("testChannel", { channelId });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  const deliveries = r.board.channelDeliveries.filter(d => d.channelId === channelId);
  must(deliveries.length >= 1, "no delivery row was recorded");
  must(typeof r.json.delivered?.ok === "boolean", "the delivery outcome is not reported");
  return `ok=${r.json.delivered.ok} status=${r.json.delivered.status}`;
});

await step("updateChannel disables", async () => {
  const r = await act("updateChannel", { channelId, enabled: false });
  must(r.ok, r.error);
  must(r.board.channels.find(c => c.id === channelId)?.enabled === false, "channel stayed enabled");
});

await step("createEvalTask", async () => {
  const r = await act("createEvalTask", { agentId, name: "Sweep eval", prompt: "Reply with the word banana.", expected: "banana" });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  evalTaskId = r.json.taskId;
  must(r.board.evals.tasks.some(t => t.id === evalTaskId), "eval task missing from board");
});

await step("runEvalTask scores the reply", async () => {
  const r = await act("runEvalTask", { taskId: evalTaskId });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  const rows = r.board.evals.results.filter(x => x.taskId === evalTaskId);
  must(rows.length >= 1, "no eval result recorded");
  // ERROR is an honest status when the provider cannot answer (no key, no balance, timeout); a
  // rolled-up PASS/FAIL would be a lie. Accept it, but require the row to say what happened.
  must(["PASS", "FAIL", "SKIPPED", "ERROR"].includes(rows[0].status), `unexpected eval status ${rows[0].status}`);
  if (rows[0].status === "ERROR") must(rows[0].detail.length > 0, "an ERROR row must carry the provider's reason");
  return `${rows[0].status} score=${rows[0].score}`;
});

await step("createTrigger + revokeTrigger", async () => {
  const r = await act("createTrigger", { teamId, label: "Sweep trigger" });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  triggerId = r.json.triggerId;
  must(r.board.triggers.some(t => t.id === triggerId), "trigger missing from board");
  const token = r.json.token;
  must(token, "trigger has no token");

  // A credential in a query string is a credential in an access log.
  const queryOnly = await fetch(`${BASE}/api/trigger?token=${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "query string must not authenticate" }) });
  must(queryOnly.status === 401, `query-string token was accepted (HTTP ${queryOnly.status})`);

  // Header auth works, and the same body with the same key returns the first run, not a second.
  const body = { text: "Sweep inbound idempotency check" };
  const first = await fetch(`${BASE}/api/trigger`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const firstJson = await first.json();
  must(firstJson.runId, `trigger did not start a run: ${JSON.stringify(firstJson).slice(0, 160)}`);
  const again = await fetch(`${BASE}/api/trigger`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const againJson = await again.json();
  must(againJson.deduplicated === true, "a retry was not recognised as a duplicate");
  must(againJson.runId === firstJson.runId, "a retry started a second run");

  const gone = await act("revokeTrigger", { triggerId });
  must(gone.ok, gone.error);
  must(!gone.board.triggers.some(t => t.id === triggerId), "trigger survived revoke");
});

await step("runTool calc", async () => {
  const r = await act("runTool", { agentId, toolId: "calc", toolInput: "2+2" });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  must(r.json.tool?.ok === true, `tool refused: ${r.json.tool?.error}`);
  must(String(r.json.tool.output).includes("4"), `wrong output: ${r.json.tool.output}`);
  toolRunId = r.json.runId;
  must(r.board.runs.some(x => x.id === toolRunId), "tool run missing from board");
});

await step("runSandboxCommand (when a provider is active)", async () => {
  const b = (await http("GET", "/api/board")).json;
  if (b.sandbox.provider === "unconfigured") return "skipped: no provider";
  const r = await act("runSandboxCommand", { agentId, command: "printf arvo-ok" });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  must(r.json.sandbox?.ok === true, `sandbox refused: ${r.json.sandbox?.error}`);
  must(String(r.json.sandbox.output).includes("arvo-ok"), `wrong output: ${r.json.sandbox.output}`);
  must(r.board.runs.some(x => x.id === r.json.sandbox.runId), "sandbox run missing from board");
  return `${r.json.sandbox.provider} · ${r.json.sandbox.runId.slice(0, 8)}`;
});

await step("loadEarlier pages history", async () => {
  const time = new Date(Date.now() + 60_000).toISOString();
  const r = await act("loadEarlier", { before: time });
  must(r.ok, r.error ?? `HTTP ${r.status}`);
  must(Array.isArray(r.json.earlier), "earlier page is not an array");
});

await step("renameWorkspace", async () => {
  const r = await act("renameWorkspace", { name: "Sweep workspace" });
  must(r.ok, r.error);
  must(r.board.workspace.name === "Sweep workspace", "name did not change");
});

await step("updateWorkspace timezone", async () => {
  const r = await act("updateWorkspace", { timezone: "Asia/Kolkata" });
  must(r.ok, r.error);
  must(r.board.workspace.timezone === "Asia/Kolkata", "timezone did not change");
});

await step("rejects an unknown action", async () => {
  const r = await act("definitelyNotAnAction");
  must(!r.ok, "an unknown action was accepted");
  must(r.status === 400, `expected 400, got ${r.status}`);
});

await step("cross-origin write is refused", async () => {
  const r = await http("POST", "/api/board", { action: "renameWorkspace", name: "Hijacked" }, { origin: "https://evil.example" });
  must(r.status === 403, `expected 403, got ${r.status}`);
  const b = await http("GET", "/api/board");
  must(b.json.workspace.name === "Sweep workspace", "a cross-origin write changed the workspace");
});

await step("deleteRoutine", async () => {
  const r = await act("deleteRoutine", { routineId });
  must(r.ok, r.error);
  must(!r.board.routines.some(x => x.id === routineId), "routine survived delete");
});

await step("deleteEvalTask", async () => {
  const r = await act("deleteEvalTask", { taskId: evalTaskId });
  must(r.ok, r.error);
  must(!r.board.evals.tasks.some(t => t.id === evalTaskId), "eval task survived delete");
});

await step("deleteMemory", async () => {
  const r = await act("deleteMemory", { memoryId });
  must(r.ok, r.error);
  must(!r.board.memories.some(m => m.id === memoryId), "memory survived delete");
});

await step("deleteChannel", async () => {
  const r = await act("deleteChannel", { channelId });
  must(r.ok, r.error);
  must(!r.board.channels.some(c => c.id === channelId), "channel survived delete");
});

await step("deleteTeam", async () => {
  const r = await act("deleteTeam", { teamId });
  must(r.ok, r.error);
  must(!r.board.teams.some(t => t.id === teamId), "team survived delete");
  must(seat(r.board, agentId)?.teamId === null, "the seat did not return to the bench");
});

await step("deleteAgent", async () => {
  const r = await act("deleteAgent", { agentId });
  must(r.ok, r.error);
  must(!seat(r.board, agentId), "deleted agent still on the board");
});

await step("board stays consistent after teardown", async () => {
  const r = await http("GET", "/api/board");
  must(r.status === 200, `GET returned ${r.status}`);
  const b = r.json;
  must(b.agents.length === 0, `${b.agents.length} agents left`);
  must(b.teams.length === 0, `${b.teams.length} teams left`);
  must(b.channels.length === 0, `${b.channels.length} channels left`);
  must(b.memories.length === 0, `${b.memories.length} memories left`);
});

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
if (failed.length) {
  console.log("Failed:", failed.map(f => f.name).join(", "));
  process.exit(1);
}
