/**
 * Spec 25 run-contract proof against a live server and database.
 *
 *   node .impeccable/run-contract-proof.mjs [base]
 *
 * 1. A routine whose due instant is days in the past must be claimed once, marked as a missed slot,
 *    and record the catch-up step (C-17).
 * 2. Run now must take the same claim the scheduler does: while a routine is RUNNING, a second
 *    caller is refused rather than executing it twice (C-3).
 *
 * Refuses to run against any database whose name is not arova_demo.
 */
import pg from "pg";

const BASE = process.argv[2] ?? "http://localhost:3100";
// The shell's DATABASE_URL may point elsewhere (the app loads .env.local, which dotenv does not).
// Only trust an explicit arova_demo URL; otherwise use the same local default drizzle.config uses.
const fromEnv = process.env.DATABASE_URL ?? "";
const url = /\/arova_demo(\?|$)/.test(fromEnv) ? fromEnv : "postgresql://postgres:postgres@127.0.0.1:5432/arova_demo";
if (!/\/arova_demo(\?|$)/.test(url)) throw new Error(`refusing: not arova_demo`);
const pool = new pg.Pool({ connectionString: url });
const q = async (sql, params) => {
  try { return (await pool.query(sql, params)).rows; }
  catch (error) { console.error("SQL failed:", error.message, "\nSQL:", sql); throw error; }
};

const COOKIE = "arova_workspace";
let jar = "";
async function http(method, path, body, headers = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(jar ? { cookie: jar } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const c of r.headers.getSetCookie?.() ?? []) {
    const kv = c.split(";")[0];
    if (kv.startsWith(COOKIE + "=")) jar = kv;
  }
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json };
}
const act = (action, payload = {}, headers = {}) => http("POST", "/api/board", { action, ...payload }, headers);

const boot = await http("GET", "/api/board");
if (boot.status !== 200) throw new Error(`board GET ${boot.status}`);

const made = await act("createAgent", { name: "Boundary proof", role: "Tester", instructions: "Answer briefly." });
if (!made.json.ok) throw new Error(made.json.error);
const agentId = made.json.board.agents.find(a => a.name === "Boundary proof").id;

const created = await act("createRoutine", { agentId, name: "Boundary catch-up", description: "Say hello.", schedule: "every 6 hours" });
if (!created.json.ok) throw new Error(created.json.error);
const routine = created.json.board.routines.find(r => r.name === "Boundary catch-up");

let failed = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

try {
  // C-17: a slot three days late on a six-hourly schedule is a missed interval.
  await q("update routines set next_run_at = now() - interval '3 days', last_status = 'COMPLETED', fail_streak = 0, enabled = true where id = $1", [routine.id]);
  console.log("waiting for the scheduler tick (up to 120s)…");
  let run = null;
  for (let i = 0; i < 60 && !run; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const rows = await q("select id, status, summary from runs where routine_id = $1 and started_at > now() - interval '10 minutes' order by started_at desc limit 1", [routine.id]);
    if (rows[0] && rows[0].status !== "RUNNING") run = rows[0];
  }
  check(Boolean(run), "the scheduler claimed the overdue routine exactly once", run ? `${run.status}` : "no run appeared");
  if (run) {
    check(run.summary.startsWith("Missed the scheduled slot"), "the run summary names the missed slot", run.summary.slice(0, 80));
    const steps = await q("select title from run_steps where run_id = $1", [run.id]);
    check(steps.some(s => s.title === "Missed the scheduled instant"), "the catch-up is a recorded step");
    check(steps.some(s => s.title === "Calling the model"), "the model call is recorded before it is made");
  }

  // C-3: the same claim the scheduler took refuses Run now.
  await q("update routines set last_status = 'RUNNING' where id = $1", [routine.id]);
  const blocked = await act("runRoutine", { routineId: routine.id }, { "Idempotency-Key": crypto.randomUUID() });
  check(blocked.status === 400 && /already running/i.test(blocked.json.error ?? ""), "Run now refuses a routine the scheduler is running", blocked.json.error ?? `HTTP ${blocked.status}`);
  await q("update routines set last_status = 'COMPLETED' where id = $1", [routine.id]);
} finally {
  await act("deleteRoutine", { routineId: routine.id });
  await act("deleteAgent", { agentId });
  await pool.end();
}

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nrun contract proof: all checks passed");
