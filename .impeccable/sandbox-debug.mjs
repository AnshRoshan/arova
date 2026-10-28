/** One sandbox command outside the app, with SRT_DEBUG, to see what the first run is doing. */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const ws = join(root, ".arova", "sandboxes", "debug");
mkdirSync(ws, { recursive: true });
const settingsPath = join(ws, "srt-settings.json");
writeFileSync(settingsPath, JSON.stringify({
  network: { allowedDomains: [], deniedDomains: [] },
  filesystem: {
    denyRead: [".env", ".env.local", join(root, ".env"), join(root, ".env.local")],
    allowWrite: [ws],
    denyWrite: [".env", ".env.local"],
  },
}, null, 2));

const cli = resolve("node_modules/@anthropic-ai/sandbox-runtime/dist/cli.js");
const started = Date.now();
const child = spawn(process.execPath, [cli, "--settings", settingsPath, "-c", process.argv[2] ?? "echo hi"], {
  cwd: ws,
  env: { ...process.env, SRT_DEBUG: "1" },
});
let out = "", err = "";
child.stdout.on("data", d => { out += d; });
child.stderr.on("data", d => { err += d; });
const budgetMs = Number(process.argv[3] ?? 900_000);
const timer = setTimeout(() => {
  console.log(`[still running after ${budgetMs}ms; killing]`);
  spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
}, budgetMs);
child.on("close", code => {
  clearTimeout(timer);
  console.log(JSON.stringify({ code, ms: Date.now() - started }, null, 2));
  console.log("STDOUT:\n" + out.slice(-4000));
  console.log("STDERR:\n" + err.slice(-8000));
});
