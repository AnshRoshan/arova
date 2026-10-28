/**
 * Live proof for the local-os sandbox now that the host is provisioned.
 *
 * Checks that in this order: a command really runs, network egress is refused by the policy, and a
 * write outside the workspace does not land on the host. Every command goes through the same API a
 * human uses, so the run/step/audit rows are the ones the product would keep.
 *
 *   AROVA_SANDBOX_PROVIDER=local-os npm run dev
 *   node .impeccable/sandbox-proof.mjs
 */
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
const BASE = process.env.AROVA_BASE ?? "http://localhost:3000";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const init = await fetch(`${BASE}/api/board`);
const cookie = (init.headers.get("set-cookie") ?? "").split(";")[0];
const workspace = cookie.split("=")[1];
const headers = { cookie, "content-type": "application/json" };
const act = async (action, payload) => {
  const response = await fetch(`${BASE}/api/board`, { method: "POST", headers, body: JSON.stringify({ action, ...payload }) });
  const body = await response.json().catch(() => ({}));
  assert.equal(response.status, 200, `${action} -> ${response.status} ${body.error ?? ""}`);
  return body;
};

const escapeTarget = process.env.ESCAPE_TARGET ?? "C:\\arova-sandbox-escape.txt";
let agentId = null;
try {
  const created = await act("createAgent", { name: "Runner", role: "operator" });
  agentId = created.agent?.id ?? created.agentId;

  const ran = await act("runSandboxCommand", { agentId, command: "echo arova-sandbox-ok" });
  const echo = ran.sandbox ?? {};
  assert.equal(echo.ok, true, `echo should run: ${echo.error ?? ""}`);
  assert.match(String(echo.output), /arova-sandbox-ok/, "the command's real output comes back");

  const network = await act("runSandboxCommand", { agentId, command: "curl -sS --max-time 6 https://example.com" });
  const net = network.sandbox ?? {};
  assert.equal(net.ok, false, "egress must be refused with the default empty allowlist");

  const escape = await act("runSandboxCommand", { agentId, command: `echo nope > ${escapeTarget}` });
  const write = escape.sandbox ?? {};
  assert.equal(write.ok, false, "a write outside the workspace must be refused");

  const board = await (await fetch(`${BASE}/api/board`, { headers: { cookie } })).json();
  const runs = board.runs.filter(run => run.agentId === agentId && String(run.title).startsWith("Sandbox ·"));
  const audits = board.events.filter(event => event.agentId === agentId && event.type.startsWith("sandbox."));
  assert.equal(runs.length, 3, "each command is a real run");
  assert.equal(runs.filter(run => run.status === "COMPLETED").length, 1, "only the allowed command completed");
  assert.equal(audits.length, 3, "each command is audited");
  const landed = existsSync(escapeTarget);
  if (landed) rmSync(escapeTarget, { force: true });
  assert.equal(landed, false, "nothing landed outside the workspace");

  console.log(JSON.stringify({
    workspace,
    provider: echo.provider,
    echo: String(echo.output).slice(0, 120),
    networkRefusal: String(net.error ?? "").slice(0, 300),
    writeRefusal: String(write.error ?? "").slice(0, 300),
    runs: runs.map(run => run.status),
    audits: audits.map(event => event.type),
  }, null, 2));
  console.log("PASS local-os sandbox: runs, refuses network, contains writes");
} finally {
  await pool.query("delete from workspaces where id = $1", [workspace]).catch(() => {});
  await pool.end();
}
