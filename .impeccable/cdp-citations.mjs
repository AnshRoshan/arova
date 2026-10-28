/**
 * Reads the rendered citation line through the real app in headless Chrome (raw CDP, no deps —
 * Node 24 has a global WebSocket). Proves the UI shows the ledger's numbers and the unresolved-
 * citation warning, not just that the JSON payload carries them.
 *
 *   node .impeccable/cdp-citations.mjs <workspace-id>
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9344;
const workspace = process.argv[2];
if (!workspace) { console.error("usage: node .impeccable/cdp-citations.mjs <workspace-id>"); process.exit(1); }

const profile = mkdtempSync(join(tmpdir(), "arova-cite-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function targets() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(target => target.type === "page");
      if (page) return page;
    } catch { /* chrome still starting */ }
    await wait(250);
  }
  throw new Error("chrome did not expose a page target");
}

const page = await targets();
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

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCookie", { name: "arova_workspace", value: workspace, domain: "localhost", path: "/", httpOnly: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:3000/" });
await wait(4000);

const read = async expression => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;

// Make sure the agent whose thread holds the proof reply is the selected one.
const selected = await read(`(() => {
  const item = [...document.querySelectorAll('button.agent-card, .agent-card')].find(el => /Citer/.test(el.textContent || ""));
  if (item) item.click();
  return Boolean(item);
})()`);
await wait(1200);
const readReport = () => read(`(() => {
  const entries = [...document.querySelectorAll('.entry')];
  const entry = entries.find(el => /Arova is a workspace/.test(el.textContent || ""));
  if (!entry) return { found: false, entries: entries.length };
  const hints = [...entry.querySelectorAll('.hint')].map(el => ({ text: el.textContent.trim(), color: getComputedStyle(el).color }));
  return {
    found: true,
    sources: hints.filter(h => h.text.startsWith("Sources:")).map(h => h.text),
    warning: hints.filter(h => h.text.startsWith("Cited")).map(h => h.text),
    warningColor: hints.find(h => h.text.startsWith("Cited"))?.color ?? null,
    links: [...entry.querySelectorAll('a')].map(a => a.textContent.trim()),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
})()`);
const report = await readReport();
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await wait(800);
const mobile = await readReport();

console.log(JSON.stringify({ selected, report, mobile, consoleErrors }, null, 2));
ws.close();
chrome.kill();
await wait(300);
rmSync(profile, { recursive: true, force: true });
if (!report.found || !report.sources?.length || !report.warning?.length || report.overflow || mobile.overflow) process.exit(1);
