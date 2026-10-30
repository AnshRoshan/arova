/**
 * Spec 27 live proof: versions pin what a run used, read-only tools write no effect, and the human
 * sandbox console writes one row before it runs.
 *
 *   node .impeccable/versions-effects-proof.mjs [base]
 */
import pg from "pg";

const BASE = process.argv[2] ?? "http://localhost:3100";
const fromEnv = process.env.DATABASE_URL ?? "";
const url = /\/arova_demo(\?|$)/.test(fromEnv) ? fromEnv : "postgresql://postgres:postgres@127.0.0.1:5432/arova_demo";
if (!/\/arova_demo(\?|$)/.test(url)) throw new Error("refusing: not arova_demo");
const pool = new pg.Pool({ connectionString: url });
const q = async (sql, params) => (await pool.query(sql, params)).rows;

let jar = "";
async function http(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(jar ? { cookie: jar } : {}) }, body: body ? JSON.stringify(body) : undefined });
  for (const c of r.headers.getSetCookie?.() ?? []) { const kv = c.split(";")[0]; if (kv.startsWith("arova_workspace=")) jar = kv; }
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: r.status, json };
}
const act = (action, payload = {}) => http("POST", "/api/board", { action, ...payload });
const must = (cond, message) => { if (!cond) throw new Error(message); };
let failed = 0;
const check = (ok, label, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); if (!ok) failed++; };

const boot = await http("GET", "/api/board");
must(boot.status === 200, `board GET ${boot.status}`);
const made = await act("createAgent", { name: "Version proof", role: "tester", instructions: "v1 instructions" });
const agentId = made.json.agentId ?? made.json.board.agents.find(a => a.name === "Version proof").id;
const workspaceId = made.json.board.workspace.id;

try {
  const v1 = await q("select id, version, instructions from agent_versions where agent_id = $1 order by version", [agentId]);
  check(v1.length === 1 && v1[0].version === 1, "creating a seat publishes version 1", v1.map(v => `${v.version}:${v.instructions}`).join(", "));

  const changed = await act("updateAgent", { agentId, instructions: "v2 instructions" });
  must(changed.json.ok, changed.json.error);
  const v2 = await q("select id, version, instructions from agent_versions where agent_id = $1 order by version", [agentId]);
  check(v2.length === 2 && v2[1].version === 2 && v2[1].instructions === "v2 instructions", "an instruction edit publishes version 2", `${v2.length} row(s)`);

  const tool = await act("runTool", { agentId, toolId: "calc", toolInput: "6*7" });
  must(tool.json.ok && tool.json.tool.ok, tool.json.error ?? "tool refused");
  const pinned = await q("select agent_version_id from runs where id = $1", [tool.json.runId]);
  check(pinned[0]?.agent_version_id === v2[1].id, "the run pins the version it started with");

  const effectsAfterTool = await q("select count(*)::int n from external_effects where workspace_id = $1", [workspaceId]);
  check(effectsAfterTool[0].n === 0, "a read-only tool writes no effects row", `${effectsAfterTool[0].n} row(s)`);

  // A later edit must not rewrite the run that already happened.
  const later = await act("updateAgent", { agentId, instructions: "v3 instructions" });
  must(later.json.ok, later.json.error);
  const stillPinned = await q("select agent_version_id from runs where id = $1", [tool.json.runId]);
  check(stillPinned[0]?.agent_version_id === v2[1].id, "a later edit does not move the finished run");
  const v3 = await q("select count(*)::int n from agent_versions where agent_id = $1", [agentId]);
  check(v3[0].n === 3, "the edit published version 3", `${v3[0].n} rows`);

  const board = (await http("GET", "/api/board")).json;
  if (board.sandbox.provider !== "unconfigured") {
    const ran = await act("runSandboxCommand", { agentId, command: "printf effect-ok" });
    must(ran.json.ok, ran.json.error);
    check(ran.json.sandbox.ok === true, "the sandbox command ran", ran.json.sandbox.provider);
    const effects = await q("select kind, status, metadata->>'command' as command from external_effects where workspace_id = $1", [workspaceId]);
    check(effects.length === 1 && effects[0].kind === "sandbox_command", "the sandbox wrote one effects row", effects.map(e => `${e.kind}:${e.status}`).join(", "));
    check(effects[0]?.status === "succeeded", "the effect finished as succeeded");
    check(effects[0]?.command === "printf effect-ok", "the attempt stored the command for the audit");

    const exported = await http("GET", "/api/export");
    const exportedCommand = exported.json.externalEffects?.[0]?.metadata?.command;
    check(exportedCommand === "[redacted from export]", "the export redacts typed commands", String(exportedCommand));
  } else {
    check(true, "sandbox checks skipped — no provider");
  }
} finally {
  await act("deleteAgent", { agentId });
  await pool.end();
}

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nversions and effects proof: all checks passed");
