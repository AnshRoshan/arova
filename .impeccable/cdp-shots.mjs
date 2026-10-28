/** Screenshots of the shell for a redesign pass: overview + each Integrations tab, desktop and phone. */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9349;
const BASE = "http://localhost:3000";
const OUT = ".impeccable/shots";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
mkdirSync(OUT, { recursive: true });

const init = await fetch(`${BASE}/api/board`);
const cookie = (init.headers.get("set-cookie") ?? "").split(";")[0];
const workspace = cookie.split("=")[1];
const headers = { cookie, "content-type": "application/json" };
const act = async (action, payload) => (await (await fetch(`${BASE}/api/board`, { method: "POST", headers, body: JSON.stringify({ action, ...payload }) })).json());
const team = await act("createEmptyTeam", { name: "Cartography", brief: "Maps the territory before anyone walks it." });
const teamId = team.team?.id ?? team.teamId;
const atlas = await act("createAgent", { name: "Atlas", role: "researcher", teamId });
const vela = await act("createAgent", { name: "Vela", role: "writer", teamId });
await act("assignOrgLead", { teamId, agentId: atlas.agent?.id ?? atlas.agentId });
await act("createRoutine", { agentId: atlas.agent?.id ?? atlas.agentId, name: "Nightly index", description: "Re-index what changed today.", schedule: "Every day at 8:00 AM" });

const profile = mkdtempSync(join(tmpdir(), "arova-shots-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
let page;
for (let i = 0; i < 60 && !page; i++) {
  try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === "page"); } catch { /* starting */ }
  await sleep(250);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 1; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = id++; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
const read = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const shot = async name => {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(data, "base64"));
  console.log(name, createHash("md5").update(readFileSync(file)).digest("hex").slice(0, 12));
};

await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Network.setCookie", { name: "arova_workspace", value: workspace, domain: "localhost", path: "/", httpOnly: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `${BASE}/` });
await sleep(4000);
const P = process.argv[2] ?? "redesign-before";
await shot(`${P}-overview`);

await read(`(() => { const rail = [...document.querySelectorAll('button')].find(el => (el.textContent || "").trim() === "Integrations"); rail?.click(); return true; })()`);
await sleep(1200);
await shot(`${P}-connectors`);
for (const [tab, name] of [["Local tools", "local"], ["Sandbox", "sandbox"], ["Channels", "channels"], ["MCP servers", "mcp"]]) {
  await read(`(() => { const t = [...document.querySelectorAll('.sp-item')].find(el => (el.textContent || "").trim().startsWith(${JSON.stringify(tab)})); t?.click(); return true; })()`);
  await sleep(600);
  await shot(`${P}-${name}`);
}
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(800);
await shot(`${P}-mobile`);

console.log(JSON.stringify({ workspace, teamId }));
ws.close(); chrome.kill(); await sleep(300); try { rmSync(profile, { recursive: true, force: true }); } catch { /* chrome may still hold a file */ }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query("delete from workspaces where id = $1", [workspace]).catch(() => {});
await pool.end();
