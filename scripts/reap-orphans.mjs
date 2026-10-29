/**
 * Reaps compile workers left behind by a previous `next dev` whose parent died.
 *
 * A turbopack dev server forks `node .../.next/dev/build/postcss.js` per build
 * request. If the server is killed (taskkill /PID without /T), those children
 * are reparented to nothing, never exit, and each holds ~43 MB of Windows
 * commit memory. Enough of them starve PostgreSQL and stop the service.
 *
 * Only a node process whose command line contains THIS project root AND the
 * .next postcss worker path, whose parent is gone, is ever touched.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function reapOrphans(root = DEFAULT_ROOT, { quiet = false } = {}) {
  if (process.platform !== "win32") return 0;

  const escaped = root.replace(/'/g, "''");
  const ps = `
$root = '${escaped}'
$killed = 0
$self = $PID
foreach ($p in @(Get-CimInstance Win32_Process -Filter "Name='node.exe'")) {
  $cmd = $p.CommandLine
  if (-not $cmd) { continue }
  if ($cmd -notlike ('*' + $root + '*')) { continue }
  if ($cmd -notmatch '\\.next[\\\\/].*postcss\\.js') { continue }
  if ($p.ProcessId -eq $self) { continue }
  if ($p.ParentProcessId -ne 0 -and (Get-Process -Id $p.ParentProcessId -ErrorAction SilentlyContinue)) { continue }
  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch { continue }
  $killed++
}
Write-Output $killed
`;

  const encoded = Buffer.from(ps, "utf16le").toString("base64");
  const res = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    { encoding: "utf8", windowsHide: true },
  );

  const killed = Number.parseInt((res.stdout ?? "").trim(), 10) || 0;
  if (killed > 0 && !quiet) {
    console.log(`[dev] reaped ${killed} orphaned compile worker(s) from a previous run`);
  }
  return killed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const quiet = process.argv.includes("--quiet");
  const n = reapOrphans(undefined, { quiet: true });
  if (!quiet) console.log(`[dev] ${n} orphaned compile worker(s) reaped`);
}
