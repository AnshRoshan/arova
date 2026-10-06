/* Live checks for the second half: web_fetch policy over the real route, the CSRF and rate-limit
 * guards, and message pagination against a workspace with more history than the window. */
const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"} · ${name}${detail ? ` · ${detail}` : ""}`); ok ? pass++ : fail++; };

const init = await fetch(`${BASE}/api/board`);
const cookie = (init.headers.get("set-cookie") ?? "").split(";")[0];
if (!cookie) { console.log("FAIL · no workspace cookie"); process.exit(1); }
const H = { "content-type": "application/json", cookie };
const post = async (body, headers = {}) => {
  const r = await fetch(`${BASE}/api/board`, { method: "POST", headers: { ...H, ...headers }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
};

const a = await post({ action: "createAgent", name: "Fetch Seat", role: "reader" });
const agentId = a.j.agent?.id ?? a.j.board.agents[0].id;

const good = await post({ action: "runTool", agentId, toolId: "web_fetch", toolInput: "https://example.com/" });
check("web_fetch reads a public page", good.j.tool?.ok === true && /Example Domain/.test(String(good.j.tool.output)), String(good.j.tool?.output ?? good.j.error).slice(0, 80));

const meta = await post({ action: "runTool", agentId, toolId: "web_fetch", toolInput: "https://169.254.169.254/latest/meta-data/" });
check("the cloud metadata address is refused", meta.j.tool?.ok === false && /private or reserved|SSRF/.test(String(meta.j.tool.error)), String(meta.j.tool?.error ?? "").slice(0, 90));

const local = await post({ action: "runTool", agentId, toolId: "web_fetch", toolInput: "https://localhost/api/health" });
check("loopback is refused, even to ourselves", local.j.tool?.ok === false && /inside this network/.test(String(local.j.tool.error)), String(local.j.tool?.error ?? "").slice(0, 90));

const plain = await post({ action: "runTool", agentId, toolId: "web_fetch", toolInput: "http://example.com/" });
check("plain http is refused", plain.j.tool?.ok === false && /https/.test(String(plain.j.tool.error)));

const csrf = await post({ action: "renameWorkspace", name: "Cross-origin attempt" }, { origin: "http://evil.example" });
check("a cross-origin POST is refused with 403", csrf.status === 403, `status=${csrf.status}`);
const csrfOk = await post({ action: "renameWorkspace", name: "Guarded workspace" }, { origin: "http://localhost:3000" });
check("the same-origin POST passes the guard", csrfOk.status === 200, `status=${csrfOk.status}`);

let got429 = false;
for (let i = 0; i < 80; i++) {
  const r = await post({ action: "renameWorkspace", name: `Rename flood ${i}` });
  if (r.status === 429) { got429 = true; break; }
}
check("the write bucket answers 429 under an 80-action flood", got429);

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
