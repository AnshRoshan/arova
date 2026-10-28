/**
 * Live proof of the WSL (bubblewrap) sandbox through the app's own API.
 *
 *   AROVA_SANDBOX_PROVIDER=wsl npm run dev
 *   node .impeccable/sandbox-wsl-proof.mjs
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
const BASE = process.env.AROVA_BASE ?? "http://localhost:3000";
const PROJECT_WSL = process.env.PROJECT_WSL ?? "/mnt/c/Users/Ansh/Documents/ANSH/OpenDots/arova";
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

let agentId = null;
try {
  const created = await act("createAgent", { name: "Bubbles", role: "operator" });
  agentId = created.agent?.id ?? created.agentId;

  const run = async command => (await act("runSandboxCommand", { agentId, command })).sandbox ?? {};

  const echo = await run("echo arova-wsl-ok");
  assert.equal(echo.ok, true, `echo should run: ${echo.error ?? ""}`);
  assert.match(String(echo.output), /arova-wsl-ok/, "the command's output comes back");
  assert.equal(echo.provider, "wsl", "the WSL provider is the one running");

  // The file exists on the host; inside the sandbox the Windows profile is masked.
  let hostSees = true;
  try { execFileSync("wsl.exe", ["-e", "test", "-e", `${PROJECT_WSL}/memory.md`], { stdio: "ignore" }); } catch { hostSees = false; }
  assert.equal(hostSees, true, "the file is there outside the sandbox");
  const hidden = await run(`test -e ${PROJECT_WSL}/memory.md && echo LEAK || echo hidden`);
  assert.equal(hidden.ok, true, `probe should run: ${hidden.error ?? ""}`);
  assert.match(String(hidden.output), /hidden/, "the Windows profile is not visible");
  assert.doesNotMatch(String(hidden.output), /LEAK/);

  const net = await run("timeout 3 bash -c 'echo > /dev/tcp/1.1.1.1/443'");
  assert.equal(net.ok, false, "network egress must fail: there is no network namespace route");

  const escape = await run("echo nope > /etc/arova-sandbox-escape");
  assert.equal(escape.ok, false, "the root filesystem is read-only");

  const home = await run("ls /home/ansh | wc -l");
  assert.equal(home.ok, true);
  assert.equal(String(home.output).trim(), "0", "the Linux home is masked");

  const board = await (await fetch(`${BASE}/api/board`, { headers: { cookie } })).json();
  const runs = board.runs.filter(item => item.agentId === agentId && String(item.title).startsWith("Sandbox ·"));
  const audits = board.events.filter(event => event.agentId === agentId && event.type.startsWith("sandbox."));
  assert.equal(runs.length, 5, "every command is a real run");
  assert.equal(runs.filter(item => item.status === "COMPLETED").length, 3, "echo, the leak probe and the home probe completed");
  assert.equal(audits.length, 5, "every command is audited");

  console.log(JSON.stringify({
    workspace,
    provider: echo.provider,
    echo: String(echo.output).trim(),
    profileProbe: String(hidden.output).trim(),
    networkRefusal: String(net.error ?? "").slice(0, 220),
    writeRefusal: String(escape.error ?? "").slice(0, 220),
    linuxHomeEntries: String(home.output).trim(),
    runs: runs.map(item => item.status),
  }, null, 2));
  console.log("PASS WSL sandbox: runs, hides both homes, no network, read-only root");
} finally {
  await pool.query("delete from workspaces where id = $1", [workspace]).catch(() => {});
  await pool.end();
}
