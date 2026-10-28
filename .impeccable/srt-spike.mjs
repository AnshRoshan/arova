/**
 * Phase 1 / TASKS 1.9 — sandbox-runtime spike.
 *
 * Run: node .impeccable/srt-spike.mjs
 * On Windows, first run the package's one-time provisioning (UAC + srt-sandbox user):
 *   npx sandbox-runtime windows-install
 * On Linux/WSL2: install bubblewrap, socat and Node >=22.12, then run this file.
 *
 * The script records what it actually observed. A BLOCKED initialize is a result, not a pass.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SandboxManager, SandboxRuntimeConfigSchema, VENDORED_SRT_WIN_EXE } from "@anthropic-ai/sandbox-runtime";

const workspace = join(process.cwd(), ".impeccable", "srt-workspace");
mkdirSync(workspace, { recursive: true });

const results = [];
const record = (name, status, detail = "") => {
  results.push({ name, status, detail });
  console.log(`${status.padEnd(8)} ${name}${detail ? ` — ${detail}` : ""}`);
};

const run = (command, timeoutMs = 15000) => new Promise(resolve => {
  const wrapped = SandboxManager.wrapWithSandbox(command);
  const child = spawn(wrapped, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  child.stdout.on("data", d => { out += d; });
  child.stderr.on("data", d => { err += d; });
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
    resolve({ code: null, out, err: `${err} (timeout ${timeoutMs}ms)` });
  }, timeoutMs);
  child.on("close", code => { clearTimeout(timer); resolve({ code, out, err }); });
});

const config = {
  // Empty allowlist is the CVE-2025-66479 regression check: it must deny everything.
  network: { allowedDomains: [], deniedDomains: [] },
  filesystem: {
    denyRead: ["~/.ssh", "~/.aws", "~/.config/gcloud", ".env"],
    allowWrite: [workspace, "/tmp"],
    denyWrite: [".env"],
  },
  // The library does not resolve the packaged Windows binary on its own; the CLI does.
  ...(process.platform === "win32" ? { windows: { srtWin: { path: VENDORED_SRT_WIN_EXE } } } : {}),
};

const parsed = SandboxRuntimeConfigSchema.safeParse(config);
if (!parsed.success) {
  record("config", "FAIL", JSON.stringify(parsed.error.issues).slice(0, 600));
} else {
  record("config", "PASS", "SandboxRuntimeConfigSchema accepted");
}

try {
  await SandboxManager.initialize(config);
  record("initialize", "PASS", "sandbox initialized");

  const basic = await run("echo srt-ok");
  record("basic command", basic.code === 0 ? "PASS" : "FAIL", `code=${basic.code} out=${basic.out.trim()} err=${basic.err.trim().slice(0, 160)}`);

  const net = await run("curl -sS --max-time 5 https://example.com");
  record("empty allowlist denies example.com", net.code !== 0 ? "PASS" : "FAIL", `code=${net.code} out=${net.out.slice(0, 80)} err=${net.err.slice(0, 160)}`);

  const meta = await run("curl -sS --max-time 5 http://169.254.169.254/");
  record("cloud metadata denied", meta.code !== 0 ? "PASS" : "FAIL", `code=${meta.code} err=${meta.err.slice(0, 160)}`);

  const loop = await run("curl -sS --max-time 5 http://127.0.0.1:3000/api/health");
  record("loopback denied", loop.code !== 0 ? "PASS" : "FAIL", `code=${loop.code} err=${loop.err.slice(0, 160)}`);

  const write = await run(`echo srt-ok > "${join(workspace, "write.txt")}"`);
  record("workspace write allowed", write.code === 0 ? "PASS" : "FAIL", `code=${write.code} err=${write.err.slice(0, 160)}`);

  const ssh = await run("echo x > ~/.ssh/arova-srt-test");
  record("ssh write denied", ssh.code !== 0 ? "PASS" : "FAIL", `code=${ssh.code} err=${ssh.err.slice(0, 160)}`);

  const env = await run("cat .env");
  record(".env read denied", env.code !== 0 ? "PASS" : "FAIL", `code=${env.code} err=${env.err.slice(0, 160)}`);

  const [one, two] = await Promise.all([run("echo one"), run("echo two")]);
  record("two concurrent commands", one.code === 0 && two.code === 0 ? "PASS" : "FAIL", `one=${one.code}/${one.out.trim()} two=${two.code}/${two.out.trim()}`);

  const browser = await run("npx --yes playwright --version");
  record("playwright available under srt", browser.code === 0 ? "PASS" : "SKIP", `code=${browser.code} out=${browser.out.trim().slice(0, 80)} err=${browser.err.trim().slice(0, 160)}`);
} catch (error) {
  record("initialize", "BLOCKED", error instanceof Error ? error.message.slice(0, 600) : String(error));
} finally {
  try { await SandboxManager.reset(); } catch { /* nothing started */ }
}

console.log(JSON.stringify({ workspace, results }, null, 2));
