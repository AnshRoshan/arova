import { readFileSync, writeFileSync } from "node:fs";
const page = "src/app/page.tsx";
let g = readFileSync(page, "utf8");

// 1. State + send branch wiring.
if (!g.includes("const [branching, setBranching] = useState")) {
  g = g.replace(
    "  const [retentionForm, setRetentionForm] = useState<{ events: string; usage: string }>({ events: \"\", usage: \"\" });",
    `  const [retentionForm, setRetentionForm] = useState<{ events: string; usage: string }>({ events: "", usage: "" });
  const [branching, setBranching] = useState<{ id: string; content: string } | null>(null);`
  );
}
if (!g.includes('action: "resendFromMessage"')) {
  g = g.replace(
    '      const r = await fetch("/api/board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sendMessage", agentId: agent.id, content, stream: true, ...(pendingFiles.length ? { attachments: pendingFiles } : {}) }), signal: controller.signal });',
    '      const r = await fetch("/api/board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(branching\n        ? { action: "resendFromMessage", messageId: branching.id, agentId: agent.id, content, stream: true }\n        : { action: "sendMessage", agentId: agent.id, content, stream: true, ...(pendingFiles.length ? { attachments: pendingFiles } : {}) }), signal: controller.signal });'
  );
  // clear the branch once submitted
  let n = 0;
  g = g.replace(
    `    const content = draft.trim();
    if (!content || busy || agent?.status !== "ACTIVE") return;
    setPendingFiles([]);`,
    `    const content = draft.trim();
    if (!content || busy || agent?.status !== "ACTIVE") return;
    setPendingFiles([]);
    setBranching(null);`
  );
}

// 2. User entries in the seat thread: a branch affordance + the branched chip.
const headOld = `<div className="entry-head"><strong>{mine ? "You" : String(m.metadata?.authoredByName ?? agent.name)}</strong>{m.metadata?.handoffFrom ? <span className="who">via {String(m.metadata.handoffFrom)}</span> : null}<time>{clock(m.createdAt)}</time>`;
if (!g.includes(headOld)) { console.log("HEAD NOT FOUND"); process.exit(1); }
const headNew = `<div className="entry-head"><strong>{mine ? "You" : String(m.metadata?.authoredByName ?? agent.name)}</strong>{m.metadata?.branchFrom ? <span className="who">branched re-ask · the original stays</span> : null}{m.metadata?.handoffFrom ? <span className="who">via {String(m.metadata.handoffFrom)}</span> : null}<time>{clock(m.createdAt)}</time>{mine && !m.metadata?.branchFrom && <span className="entry-tools"><button className="icon-btn" type="button" title="Edit and re-ask — opens a branch; the original is never rewritten" disabled={busy} onClick={() => { setBranching({ id: m.id, content: m.content }); setDraft(m.content); document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus(); }}><Pencil size={13} /></button></span>}`;
g = g.replace(headOld, headNew);
writeFileSync(page, g);
console.log("branch UI applied");
