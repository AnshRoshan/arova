/** Verifies the redesigned shell: activity toggle, tab wrapping, sub-nav, and no console errors. */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9352;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const init = await fetch("http://localhost:3000/api/board");
const cookie = (init.headers.get("set-cookie") ?? "").split(";")[0];
const workspace = cookie.split("=")[1];
const headers = { cookie, "content-type": "application/json" };
const act = async (action, payload) => (await (await fetch("http://localhost:3000/api/board", { method: "POST", headers, body: JSON.stringify({ action, ...payload }) })).json());
const team = await act("createEmptyTeam", { name: "Cartography", brief: "Maps." });
const teamId = team.team?.id ?? team.teamId;
const atlas = await act("createAgent", { name: "Atlas", role: "researcher", teamId });
await act("createRoutine", { agentId: atlas.agent?.id ?? atlas.agentId, name: "Nightly index", description: "Re-index.", schedule: "Every day at 8:00 AM" });

const profile = mkdtempSync(join(tmpdir(), "arova-shell-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
let page;
for (let i = 0; i < 60 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === "page"); } catch {} await sleep(250); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 1; const pending = new Map(); const errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails?.text ?? "exception");
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a => a.value ?? a.description).join(" "));
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = id++; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
const read = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Network.setCookie", { name: "arova_workspace", value: workspace, domain: "localhost", path: "/", httpOnly: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:3000/" });
await sleep(4000);

const overview = await read(`(() => ({
  aside: Boolean(document.querySelector('.overview-aside')),
  cards: document.querySelectorAll('.ov-card').length,
  boardHidden: getComputedStyle(document.querySelector('.board')).display === 'none',
}))()`);
assert.equal(overview.aside, true, "the overview aside renders");
assert.equal(overview.cards, 2, "up next and recent work");
assert.equal(overview.boardHidden, true, "the activity column starts closed");

await read(`(() => { [...document.querySelectorAll('.rail-foot .rail-btn')][0]?.click(); return true; })()`);
await sleep(500);
const opened = await read(`getComputedStyle(document.querySelector('.board')).display`);
assert.equal(opened, "flex", "the rail's activity button opens the record");
await read(`(() => { [...document.querySelectorAll('.rail-foot .rail-btn')][0]?.click(); return true; })()`);
await sleep(400);

await read(`(() => { const b = [...document.querySelectorAll('button')].find(el => (el.textContent || '').trim() === 'Automations'); b?.click(); return true; })()`);
await sleep(900);
const tabs = await read(`(() => {
  const strip = document.querySelector('.sp-tabs');
  const items = [...document.querySelectorAll('.sp-tabs [role="tab"]')].map(el => { const r = el.getBoundingClientRect(); return { text: el.textContent.trim(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
  const overlap = items.some((a, i) => items.some((b, j) => i < j && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
  return { stripWidth: strip ? Math.round(strip.getBoundingClientRect().width) : 0, scrollWidth: strip?.scrollWidth ?? 0, items, overlap };
})()`);
assert.equal(tabs.overlap, false, "no tab overlaps another");
assert.ok(tabs.scrollWidth <= tabs.stripWidth + 1, "the tab strip does not spill out of the panel");

await read(`(() => { const b = [...document.querySelectorAll('button')].find(el => (el.textContent || '').trim() === 'Integrations'); b?.click(); return true; })()`);
await sleep(900);
const integrations = await read(`(() => ({
  subnav: [...document.querySelectorAll('.sidepanel .sp-item')].map(el => el.textContent.trim()),
  heading: document.querySelector('.pane-head h1')?.textContent?.trim(),
  note: Boolean([...document.querySelectorAll('.pane-note')].find(el => /no OAuth client/.test(el.textContent || ''))),
}))()`);
assert.equal(integrations.subnav.length, 5, "five surfaces in the sub-nav");
assert.equal(integrations.heading, "Connectors");
assert.equal(integrations.note, true, "the connector note is present on Connectors");
await read(`(() => { const b = [...document.querySelectorAll('.sidepanel .sp-item')].find(el => /MCP servers/.test(el.textContent || '')); b?.click(); return true; })()`);
await sleep(600);
const mcp = await read(`(() => ({ heading: document.querySelector('.pane-head h1')?.textContent?.trim(), note: Boolean([...document.querySelectorAll('.pane-note')].find(el => /no OAuth client/.test(el.textContent || ''))) }))()`);
assert.equal(mcp.heading, "MCP servers");
assert.equal(mcp.note, false, "the connector note does not leak into another surface");
assert.deepEqual(errors, [], "no console errors");

console.log(JSON.stringify({ overview, tabs, integrations, mcp, errors }, null, 2));
console.log("PASS redesigned shell");
ws.close(); chrome.kill(); await sleep(300);
try { rmSync(profile, { recursive: true, force: true }); } catch {}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query("delete from workspaces where id = $1", [workspace]).catch(() => {});
await pool.end();
