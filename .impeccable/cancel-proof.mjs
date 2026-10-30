/**
 * Proves the finish contract against a live server: a cancel that lands while a sandbox command is
 * still running owns the row, and the command's eventual success cannot relabel it.
 *
 *   node .impeccable/cancel-proof.mjs [base]
 */
const BASE = process.argv[2] ?? "http://localhost:3100";
let jar = "";
async function http(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(jar ? { cookie: jar } : {}) }, body: body ? JSON.stringify(body) : undefined });
  for (const c of r.headers.getSetCookie?.() ?? []) { const kv = c.split(";")[0]; if (kv.startsWith("arova_workspace=")) jar = kv; }
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
const act = (action, payload = {}) => http("POST", "/api/board", { action, ...payload });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const must = (cond, message) => { if (!cond) throw new Error(message); };

const boot = await http("GET", "/api/board");
must(boot.status === 200, `board GET ${boot.status}`);
must(boot.json.sandbox.provider !== "unconfigured", "no sandbox provider is active; this proof needs one");
const made = await act("createAgent", { name: "Cancel proof", role: "tester" });
const agentId = made.json.agentId ?? made.json.board.agents.find(a => a.name === "Cancel proof").id;
console.log(`provider ${boot.json.sandbox.provider} · agent ${agentId.slice(0, 8)}`);

let failed = 0;
const check = (ok, label, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); if (!ok) failed++; };

try {
  const pending = act("runSandboxCommand", { agentId, command: "sleep 2; printf late-output" });
  let runId = null;
  for (let i = 0; i < 30 && !runId; i++) {
    await sleep(200);
    const b = (await http("GET", "/api/board")).json;
    const run = [...b.runs].find(r => r.agentId === agentId && r.title.startsWith("Sandbox ·") && r.status === "RUNNING");
    if (run) runId = run.id;
  }
  check(Boolean(runId), "the command opened a RUNNING sandbox run", runId?.slice(0, 8) ?? "none");
  must(runId, "nothing to cancel");

  const cancelled = await act("cancelRun", { runId });
  check(cancelled.status === 200 && cancelled.json.ok === true, "the person's cancel lands", cancelled.json.error ?? "");

  const result = await pending;
  check(result.json.sandbox?.ok === false, "the late command does not report success", JSON.stringify(result.json.sandbox).slice(0, 120));
  check(Boolean(result.json.sandbox?.cancelled) || /cancelled/i.test(result.json.sandbox?.error ?? ""), "the late result says it was cancelled");

  await sleep(800);
  const after = (await http("GET", "/api/board")).json.runs.find(r => r.id === runId);
  check(after?.status === "CANCELLED", "the stored row is still CANCELLED", after?.status ?? "missing");
  check(/Cancelled by user/.test(after?.summary ?? ""), "the cancel summary survives", (after?.summary ?? "").slice(0, 80));
  check(/Running the command/.test(after?.summary ?? ""), "the cancel names the step that had started", (after?.summary ?? "").slice(0, 80));
  check(!/late-output/.test(after?.summary ?? ""), "the finished command did not overwrite the summary");
} finally {
  await act("deleteAgent", { agentId });
}

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\ncancel proof: all checks passed");
