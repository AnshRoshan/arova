/** Checks the Integrations tab strip in a real browser: every tab is present, including Sandbox. */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9347;
const BASE = "http://localhost:3000";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const init = await fetch(`${BASE}/api/board`);
const cookie = (init.headers.get("set-cookie") ?? "").split(";")[0];
const workspace = cookie.split("=")[1];

const profile = mkdtempSync(join(tmpdir(), "arova-tabs-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
let page;
for (let i = 0; i < 60 && !page; i++) {
  try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(target => target.type === "page"); } catch { /* starting */ }
  await sleep(250);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let nextId = 1;
const pending = new Map();
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); message.error ? reject(new Error(message.error.message)) : resolve(message.result); }
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

const opened = await read(`(() => {
  const rail = [...document.querySelectorAll('button')].find(el => (el.textContent || "").trim() === "Integrations");
  if (!rail) return false;
  rail.click();
  return true;
})()`);
await sleep(1200);
const tabs = await read(`[...document.querySelectorAll('.sp-tabs [role="tab"]')].map(el => el.textContent.trim())`);
const clicked = await read(`(() => { const tab = [...document.querySelectorAll('.sp-tabs [role="tab"]')].find(el => /Sandbox/.test(el.textContent || "")); tab?.click(); return Boolean(tab); })()`);
await sleep(800);
const panel = await read(`(() => {
  const text = document.body.innerText;
  return {
    heading: [...document.querySelectorAll('.pane-h2')].map(el => el.textContent.trim()).find(text => /sandbox/i.test(text)) ?? null,
    notConfigured: /Not configured/.test(text),
    footer: [...document.querySelectorAll('.hint')].map(el => el.textContent.trim()).find(text => /high-risk tool/.test(text)) ?? null,
    wslHint: [...document.querySelectorAll('.hint')].map(el => el.textContent.trim()).find(text => /bubblewrap/i.test(text)) ?? null,
    noSeat: /No seat exists yet/.test(text),
  };
})()`);
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(600);
const mobile = await read(`({ tabs: [...document.querySelectorAll('.sp-tabs [role="tab"]')].map(el => el.textContent.trim()), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth })`);

console.log(JSON.stringify({ opened, tabs, clicked, panel, mobile }, null, 2));
ws.close();
chrome.kill();
await sleep(300);
rmSync(profile, { recursive: true, force: true });
if (!opened || !clicked || !tabs.some(tab => /Sandbox/.test(tab))) process.exit(1);
