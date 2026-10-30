/**
 * Research feature proof against a live server.
 *   node .impeccable/research-proof.mjs [base]
 *
 * Covers: project creation, a real fetched source, URL dedupe, a pasted excerpt, pinning, a finding
 * that cites both, a cross-project citation refused, archive, and cascade delete.
 */
const BASE = process.argv[2] ?? "http://localhost:3100";
let jar = "";
async function http(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(jar ? { cookie: jar } : {}) }, body: body ? JSON.stringify(body) : undefined });
  for (const c of r.headers.getSetCookie?.() ?? []) { const kv = c.split(";")[0]; if (kv.startsWith("arova_workspace=")) jar = kv; }
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
const act = (action, payload = {}) => http("POST", "/api/board", { action, ...payload });
const board = () => http("GET", "/api/board").then(r => r.json);
const must = (cond, message) => { if (!cond) throw new Error(message); };
let failed = 0;
const check = (ok, label, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); if (!ok) failed++; };

await board();
const made = await act("createResearchProject", { name: "Pricing proof", question: "What do rivals charge?" });
must(made.json.ok, made.json.error ?? "project not created");
const projectId = made.json.projectId;

try {
  const fetched = await act("addResearchSource", { projectId, url: "https://example.com/", tag: "reference", note: "A known public page." });
  check(fetched.json.ok === true, "a public URL is fetched and saved", fetched.json.error ?? fetched.json.kind);
  const sources = (await board()).research.sources.filter(s => s.projectId === projectId);
  check(sources.length === 1 && sources[0].excerpt.length > 20, "the readable excerpt is stored", sources[0]?.title);
  check(sources[0]?.host === "example.com" && sources[0]?.url === "https://example.com/", "the final URL and host are recorded");

  const duplicate = await act("addResearchSource", { projectId, url: "https://example.com" });
  check(duplicate.status === 400 && /already in this project/i.test(duplicate.json.error ?? ""), "the same URL is refused in one project", duplicate.json.error);

  const pasted = await act("addResearchSource", { projectId, text: "Interview notes: the per-seat price includes audit history.", title: "Interview notes", tag: "interview" });
  check(pasted.json.ok === true, "a pasted excerpt is saved without a network call", pasted.json.kind);
  const second = (await board()).research.sources.find(s => s.projectId === projectId && s.title === "Interview notes");
  check(Boolean(second), "the pasted source is on the board");

  const pin = await act("updateResearchSource", { sourceId: sources[0].id, pinned: true });
  check(pin.json.ok === true, "a source can be pinned");
  check((await board()).research.sources.find(s => s.id === sources[0].id)?.pinned === true, "the pin is stored");

  const finding = await act("saveResearchFinding", { projectId, text: "The reference page exists and the interview supports per-seat pricing.", sourceIds: [sources[0].id, second.id] });
  check(finding.json.ok === true, "a finding citing two sources is saved", finding.json.error);
  const boardAfter = await board();
  const saved = boardAfter.research.findings.find(f => f.projectId === projectId);
  check(saved?.sourceIds.length === 2, "the finding keeps both source ids");

  const other = await act("createResearchProject", { name: "Other proof", question: "" });
  const cross = await act("saveResearchFinding", { projectId: other.json.projectId, text: "Cross project citation.", sourceIds: [sources[0].id] });
  check(cross.status === 400 && /inside its project/i.test(cross.json.error ?? ""), "a finding cannot cite another project's source", cross.json.error);
  await act("deleteResearchProject", { projectId: other.json.projectId });

  const archived = await act("updateResearchProject", { projectId, status: "ARCHIVED" });
  check(archived.json.ok === true, "a project can be archived");
  check((await board()).research.projects.find(p => p.id === projectId)?.status === "ARCHIVED", "the archive state is stored");
} finally {
  await act("deleteResearchProject", { projectId });
}

const gone = (await board()).research;
check(!gone.projects.some(p => p.id === projectId), "deleting a project removes it");
check(!gone.sources.some(s => s.projectId === projectId), "its sources are gone with it");
check(!gone.findings.some(f => f.projectId === projectId), "its findings are gone with it");

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nresearch proof: all checks passed");
