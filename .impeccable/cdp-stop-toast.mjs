/**
 * Proves the Stop toast tells the truth for a tool loop: nothing was stored, so the UI must not
 * promise a partial. Drives the real composer in headless Chrome over raw CDP.
 *
 *   node .impeccable/tool-loop-fixture.mjs
 *   PROVIDERS=fixture ... npm run dev
 *   node .impeccable/cdp-stop-toast.mjs
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const BASE = "http://localhost:3000";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9346;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const init = await fetch(`${BASE}/api/board`);
const cookie = (init.headers.get("set-cookie") ?? "").split(";")[0];
const workspace = cookie.split("=")[1];
assert.ok(workspace, "a workspace cookie is required");
const created = await (await fetch(`${BASE}/api/board`, {
  method: "POST",
  headers: { cookie, "content-type": "application/json" },
  body: JSON.stringify({ action: "createAgent", name: "Stopper", role: "researcher", capabilities: { toolLoop: true } }),
})).json();
assert.ok(created.agent?.id ?? created.agentId, "the agent was created");

const profile = mkdtempSync(join(tmpdir(), "arova-stop-"));
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

await read(`(() => { const card = [...document.querySelectorAll('button.agent-card')].find(el => /Stopper/.test(el.textContent || "")); card?.click(); return Boolean(card); })()`);
await sleep(1200);
const typed = await read(`(() => {
  const textarea = document.querySelector('.composer textarea');
  if (!textarea) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(textarea, 'Research Arova and cite what you find.');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
assert.equal(typed, true, "the composer is present");
await sleep(200);
await read(`(() => { document.querySelector('.composer')?.requestSubmit(); return true; })()`);

let running = false;
for (let i = 0; i < 40; i++) {
  running = await read(`Boolean(document.querySelector('.composer .stop-btn')) && /using web_search|Running web_search/.test(document.body.innerText)`);
  if (running) break;
  await sleep(150);
}
assert.equal(running, true, "the tool loop started and the Stop control appeared");
await read(`(() => { document.querySelector('.composer .stop-btn')?.click(); return true; })()`);
await sleep(4200);

const ui = await read(`(() => {
  const toast = document.querySelector('.toast span')?.textContent?.trim() ?? null;
  const threads = [...document.querySelectorAll('.entry .entry-text')].map(el => el.textContent.trim());
  return { toast, threads, busy: Boolean(document.querySelector('.composer .stop-btn')) };
})()`);
const board = await (await fetch(`${BASE}/api/board`, { headers: { cookie } })).json();
const replies = board.messages.filter(message => message.role === "assistant" && message.agentId === (created.agent?.id ?? created.agentId));

assert.match(String(ui.toast), /Stopped before an answer was written\. Nothing was stored\./, "the toast does not promise a partial that will never exist");
assert.equal(ui.busy, false, "the composer is free again");
assert.equal(replies.length, 1, "only the greeting is stored");

console.log(JSON.stringify({ workspace, toast: ui.toast, storedReplies: replies.map(message => message.content.slice(0, 50)), consoleErrors }, null, 2));
console.log("PASS stop toast tells the truth");
ws.close();
chrome.kill();
await sleep(300);
rmSync(profile, { recursive: true, force: true });
