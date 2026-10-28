/** Drives the real Sandbox panel: open Integrations → Sandbox, press Check, read the output. */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9348;
const BASE = "http://localhost:3000";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const init = await fetch(`${BASE}/api/board`);
const cookie = (init.headers.get("set-cookie") ?? "").split(";")[0];
const workspace = cookie.split("=")[1];
const created = await (await fetch(`${BASE}/api/board`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ action: "createAgent", name: "Bubbles", role: "operator" }) })).json();
const agentId = created.agent?.id ?? created.agentId;

const profile = mkdtempSync(join(tmpdir(), "arova-sb-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
let page;
for (let i = 0; i < 60 && !page; i++) {
  try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(target => target.type === "page"); } catch { /* starting */ }
  await sleep(250);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let nextId = 1;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); message.error ? reject(new Error(message.error.message)) : resolve(message.result); }
  if (message.method === "Runtime.exceptionThrown") consoleErrors.push(message.params.exceptionDetails?.text ?? "exception");
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") consoleErrors.push(message.params.args.map(arg => arg.value ?? arg.description).join(" "));
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const read = async expression => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCookie", { name: "arova_workspace", value: workspace, domain: "localhost", path: "/", httpOnly: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `${BASE}/` });
await sleep(3500);

await read(`(() => { const card = [...document.querySelectorAll('button.agent-card')].find(el => /Bubbles/.test(el.textContent || "")); card?.click(); return Boolean(card); })()`);
await sleep(800);
await read(`(() => { const rail = [...document.querySelectorAll('button')].find(el => (el.textContent || "").trim() === "Integrations"); rail?.click(); return Boolean(rail); })()`);
await sleep(900);
await read(`(() => { const tab = [...document.querySelectorAll('.sp-tabs [role="tab"]')].find(el => /Sandbox/.test(el.textContent || "")); tab?.click(); return Boolean(tab); })()`);
await sleep(700);

const before = await read(`(() => {
  const facts = [...document.querySelectorAll('.facts .fact')].map(el => el.textContent.trim());
  const hint = [...document.querySelectorAll('.hint')].map(el => el.textContent.trim()).find(text => /bubblewrap/i.test(text)) ?? null;
  const chip = [...document.querySelectorAll('.pane-head, .pane, .kv')].map(el => el.textContent).join(' ');
  return { facts, hint, providerShown: /wsl/i.test(chip) };
})()`);

await read(`(() => { const check = [...document.querySelectorAll('button')].find(el => (el.textContent || "").trim() === "Check"); check?.click(); return Boolean(check); })()`);
let output = null;
for (let i = 0; i < 60; i++) {
  output = await read(`(() => { const pre = document.querySelector('.code pre code'); return pre ? pre.textContent.trim() : null; })()`);
  if (output) break;
  await sleep(500);
}
const after = await read(`(() => ({
  lang: document.querySelector('.code .code-lang')?.textContent?.trim() ?? null,
  output: document.querySelector('.code pre code')?.textContent?.trim() ?? null,
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
}))()`);

console.log(JSON.stringify({ before, after, consoleErrors }, null, 2));
ws.close();
chrome.kill();
await sleep(300);
rmSync(profile, { recursive: true, force: true });
await (async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("delete from workspaces where id = $1", [workspace]).catch(() => {});
  await pool.end();
})();
if (!/arova-sandbox-ok/.test(String(after.output))) process.exit(1);
