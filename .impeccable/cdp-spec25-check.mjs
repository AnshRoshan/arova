/**
 * Spec 25 UI proof: the sentences the browser shows must match the code.
 *
 *   node .impeccable/cdp-spec25-check.mjs
 *
 * Runs against http://localhost:3100 with a headless Chrome. Creates its own workspace through the
 * API, then checks the default screen, the capabilities copy, the provider-aware tool reasons, the
 * wsl reset control, and the eval scope note. Saves screenshots under .impeccable/shots/spec25/.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const BASE = "http://localhost:3100";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9357;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const init = await fetch(`${BASE}/api/board`);
const cookie = (init.headers.get("set-cookie") ?? "").split(";")[0];
const workspace = cookie.split("=")[1];
const headers = { cookie, "content-type": "application/json" };
const act = async (action, payload) => (await (await fetch(`${BASE}/api/board`, { method: "POST", headers, body: JSON.stringify({ action, ...payload }) })).json());

let agentId = null;

const outDir = ".impeccable/shots/spec25";
mkdirSync(outDir, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "arova-spec25-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
let page;
for (let i = 0; i < 60 && !page; i++) {
  try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === "page"); } catch {}
  await sleep(250);
}
assert.ok(page, "headless chrome started");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 1;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  if (m.method === "Runtime.exceptionThrown") consoleErrors.push(m.params.exceptionDetails?.text ?? "exception");
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consoleErrors.push(m.params.args.map(a => a.value ?? a.description).join(" "));
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = id++; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
const read = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const shot = async name => {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(outDir, name), Buffer.from(data, "base64"));
};
const clickText = async text => read(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true; })()`);
const clickContains = async text => read(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (!b) return false; b.click(); return true; })()`);

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Network.setCookie", { name: "arova_workspace", value: workspace, domain: "localhost", path: "/", httpOnly: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `${BASE}/` });
await sleep(4500);

const first = await read(`(() => ({ heading: (document.querySelector('.pane h1') ?? document.querySelector('h1'))?.textContent ?? '', thread: Boolean(document.querySelector('.composer')), body: document.body.innerText.slice(0, 300) }))()`);
await shot("00-debug.png");
assert.equal(first.heading, "Overview", "a first visit opens on Overview");
assert.equal(first.thread, false, "no thread is open on a first visit");
await shot("01-first-visit-overview.png");

// Seed one seat after the first visit, so the next load has a conversation to remember.
const seeded = await act("createAgent", { name: "Verity", role: "auditor" });
agentId = seeded.agentId ?? seeded.board?.agents?.find(a => a.name === "Verity")?.id;
assert.ok(agentId, "agent created");
// One suite so the Evals pane has something to render, not just an empty state.
const evalTask = await act("createEvalTask", { agentId, name: "Spec suite task", prompt: "Say one.", expected: "one" });
const evalTaskId = evalTask.taskId;
await act("createSuite", { name: "Spec suite", agentId, taskIds: [evalTaskId], callCeiling: 3 });
// C-10: a remembered seat opens that thread after a reload.
await read(`localStorage.setItem('arova.lastAgent', ${JSON.stringify(agentId)})`);
await send("Page.reload");
await sleep(4500);
const reopened = await read(`(() => ({ heading: document.querySelector('.pane h1')?.textContent ?? '', thread: Boolean(document.querySelector('.composer')) }))()`);
assert.equal(reopened.thread, true, "a remembered conversation opens its thread");
assert.notEqual(reopened.heading, "Overview", "the opening screen is not Overview when a thread was open last");
await shot("02-remembered-thread.png");

// C-12 and C-11: the capabilities copy and the removed temperature slider.
assert.equal(await clickText("Agent"), true, "the Agent button opens settings");
await sleep(700);
assert.equal(await clickText("Capabilities"), true, "Capabilities section opens");
await sleep(500);
const caps = await read(`(() => ({
  help: [...document.querySelectorAll('.caps-help')].map(p => p.textContent).join(' | '),
  all: document.body.innerText,
  browserReason: [...document.querySelectorAll('[title]')].map(el => el.getAttribute('title')).find(t => t.includes('person can use the console')) ?? '',
}))()`);
assert.match(caps.help, /Auto and Default behave the same/);
assert.ok(!caps.all.includes("Temperature"), "the temperature slider is gone");
assert.match(caps.browserReason, /person can use the console/, "the browser reason matches the active sandbox");
await shot("03-capabilities-copy.png");
await read(`(() => { document.querySelector('.dialog .x, .dialog .icon-btn.x')?.click(); return true; })()`);
await sleep(400);

// C-15 and C-14: WSL is a real provider, so reset is offered; tool reasons are provider-aware.
assert.equal(await clickContains("Integrations"), true, "the Integrations rail item opens");
await sleep(600);
assert.equal(await clickContains("Sandbox"), true, "the Sandbox sub-nav opens");
await sleep(800);
const sandbox = await read(`(() => {
  const reset = [...document.querySelectorAll('button')].find(b => (b.getAttribute('title') ?? '').startsWith('Reset the per-agent workspace'));
  return { found: Boolean(reset), disabled: reset?.disabled ?? null, text: document.querySelector('.pane')?.innerText ?? '' };
})()`);
assert.equal(sandbox.found, true, "a reset control exists");
assert.equal(sandbox.disabled, false, "reset is enabled for the wsl provider");
assert.match(sandbox.text, /WSL \+ bubblewrap/);
await shot("04-sandbox-wsl.png");

// C-13: the eval totals name their scope.
assert.equal(await clickContains("Automations"), true, "Automations opens");
await sleep(700);
assert.equal(await clickContains("Evals"), true, "Evals tab opens");
await sleep(500);
const evalText = await read(`document.querySelector('.pane')?.innerText ?? ''`);
assert.match(evalText, /SQL counts over every scored attempt/, "the pass rate names its scope");
assert.match(evalText, /SUITES/i, "the suites section renders");
assert.match(evalText, /Spec suite/i, "the stored suite is listed");
await shot("05-evals-scope.png");

assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join(" | ")}`);
console.log("spec 25 UI: all checks passed");

await act("deleteAgent", { agentId });
ws.close();
chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch {}
