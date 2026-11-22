/**
 * Starts Arova's dedicated local Postgres instance (spec 25a, 2026-10-25): data at
 * ~/arova-pg/data, port 5544, bound to 127.0.0.1 only — deliberately separate from the
 * shared instance on 5432 that belongs to other projects. `npm run db:start`.
 *
 * The script exits once the server is accepting connections: pg_ctl's own console stays
 * attached on Windows, which used to hang `npm run db:start` forever even though the
 * server was up. The wait loop polls the port, then reports and exits.
 */
const { spawn, execFile } = require("node:child_process");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const pgCtl = "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_ctl.exe";
const dataDir = path.join(os.homedir(), "arova-pg", "data");
const logFile = path.join(os.homedir(), "arova-pg", "log.txt");
const port = 5544;

const probe = () => new Promise((resolve) => {
  const socket = net.connect({ host: "127.0.0.1", port, timeout: 800 });
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("timeout", () => { socket.destroy(); resolve(false); });
  socket.once("error", () => resolve(false));
});

const waitUntilUp = (deadline) => new Promise((resolve) => {
  const tick = async () => (await probe()) ? resolve(true) : (Date.now() > deadline ? resolve(false) : setTimeout(tick, 500));
  tick();
});

const child = spawn(pgCtl, ["-D", dataDir, "-l", logFile, "-o", `-p ${port} -c listen_addresses=127.0.0.1`, "start"], { stdio: "ignore", detached: true });
child.unref();

waitUntilUp(Date.now() + 20_000).then((up) => {
  if (!up) {
    console.error("db:start — the server did not accept connections within 20s; read ~/arova-pg/log.txt");
    process.exitCode = 1;
    return;
  }
  execFile(pgCtl, ["-D", dataDir, "status"], (err, stdout) => {
    console.log("db:start — Postgres is up on 127.0.0.1:" + port);
    if (stdout) process.stdout.write(stdout);
    if (err) console.error(err.message);
  });
});
