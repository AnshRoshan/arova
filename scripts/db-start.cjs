/**
 * Starts Arova's dedicated local Postgres instance (spec 25a, 2026-10-25): data at
 * ~/arova-pg/data, port 5544, bound to 127.0.0.1 only — deliberately separate from the
 * shared instance on 5432 that belongs to other projects. `npm run db:start`.
 */
const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const pgCtl = "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_ctl.exe";
const dataDir = path.join(os.homedir(), "arova-pg", "data");
const logFile = path.join(os.homedir(), "arova-pg", "log.txt");

const child = spawn(pgCtl, ["-D", dataDir, "-l", logFile, "-o", "-p 5544 -c listen_addresses=127.0.0.1", "start"], { stdio: "inherit" });
child.on("exit", (code) => process.exitCode = code ?? 0);
