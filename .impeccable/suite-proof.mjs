/**
 * Spec 28 live proof.
 *   node .impeccable/suite-proof.mjs [base]
 *
 * 1. A seat with no usable provider: the suite is SKIPPED, makes zero calls, and shows no rate.
 * 2. A configured seat with a ceiling of 1 over two tasks: the first task runs, the second is never
 *    started, and the stored counts say so.
 */
const BASE = process.argv[2] ?? "http://localhost:3100";
let jar = "";
async function http(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(jar ? { cookie: jar } : {}) }, body: body ? JSON.stringify(body) : undefined });
  for (const c of r.headers.getSetCookie?.() ?? []) { const kv = c.split(";")[0]; if (kv.startsWith("arova_workspace=")) jar = kv; }
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
const act = (action, payload = {}) => http("POST", "/api/board", { action, ...payload });
const must = (cond, message) => { if (!cond) throw new Error(message); };
let failed = 0;
const check = (ok, label, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); if (!ok) failed++; };
const board = () => http("GET", "/api/board").then(r => r.json);

const boot = await board();
must(boot, "board did not load");
const created = [];
try {
  const localAgent = (await act("createAgent", { name: "Suite local", role: "tester", provider: "local" })).json;
  const localId = localAgent.agentId ?? localAgent.board.agents.find(a => a.name === "Suite local").id;
  created.push(localId);
  const t1 = (await act("createEvalTask", { agentId: localId, name: "Local one", prompt: "Say one.", expected: "one" })).json.taskId;
  const t2 = (await act("createEvalTask", { agentId: localId, name: "Local two", prompt: "Say two.", expected: "two" })).json.taskId;
  const localSuite = (await act("createSuite", { name: "Local suite", agentId: localId, taskIds: [t1, t2], callCeiling: 10 })).json.suiteId;
  const skipped = (await act("runSuite", { suiteId: localSuite })).json;
  check(skipped.suite?.status === "SKIPPED", "a seat with no provider skips the suite", skipped.suite?.status);
  check(skipped.suite?.modelCalls === 0, "the skipped suite spent zero calls", String(skipped.suite?.modelCalls));
  check(skipped.suite?.passRate === null, "a suite with no scored task shows no percentage");
  check(skipped.suite?.skipped === 2, "both tasks are recorded as skipped", String(skipped.suite?.skipped));

  const paidAgent = (await act("createAgent", { name: "Suite ceiling", role: "tester" })).json;
  const paidId = paidAgent.agentId ?? paidAgent.board.agents.find(a => a.name === "Suite ceiling").id;
  created.push(paidId);
  const p1 = (await act("createEvalTask", { agentId: paidId, name: "Ceiling one", prompt: "Reply banana.", expected: "banana" })).json.taskId;
  const p2 = (await act("createEvalTask", { agentId: paidId, name: "Ceiling two", prompt: "Reply apple.", expected: "apple" })).json.taskId;
  const ceilingSuite = (await act("createSuite", { name: "Ceiling suite", agentId: paidId, taskIds: [p1, p2], callCeiling: 1 })).json.suiteId;
  const run = (await act("runSuite", { suiteId: ceilingSuite })).json.suite;
  check(run?.status === "STOPPED_AT_CEILING", "the suite stops at its ceiling", run?.status);
  check(run?.modelCalls === 1, "exactly one model call was spent", String(run?.modelCalls));
  check((run?.passed ?? 0) + (run?.failed ?? 0) + (run?.skipped ?? 0) + (run?.errored ?? 0) === 1, "the second task was never started");

  const detail = (await board()).evals.suites;
  check(detail.length >= 2, "both suites are on the board", `${detail.length} suite(s)`);
} finally {
  for (const id of created) await act("deleteAgent", { agentId: id });
}

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nsuite proof: all checks passed");
