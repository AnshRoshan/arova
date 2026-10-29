/**
 * `npm run dev` entry point.
 *
 * Wraps `next dev` so a stopped dev server always takes its compile workers
 * with it. Next's turbopack pipeline forks `.../.next/dev/build/postcss.js`
 * children per build request; when the server dies alone, they orphan, never
 * exit, and each holds ~43 MB of commit until the OS runs out and PostgreSQL
 * cannot start (2026-10-29 incident: 1,179 orphans, 50.9 GB, PG stopped).
 *
 * Behaviour: reap stale workers from earlier runs, run next in a child process,
 * then `taskkill /T` that child's whole tree on Ctrl+C, SIGTERM, or exit.
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { reapOrphans } from "./reap-orphans.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

reapOrphans(root);

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  windowsHide: false,
});

let stopped = false;

function stopTree() {
  if (stopped) return;
  stopped = true;
  if (!child.pid) return;
  if (isWin) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  process.on(signal, () => {
    stopTree();
    process.exit(130);
  });
}
process.on("exit", stopTree);

child.on("error", (err) => {
  console.error(`[dev] could not start next: ${err.message}`);
  stopTree();
  process.exit(1);
});

child.on("exit", (code) => {
  stopTree();
  process.exit(code ?? 0);
});
