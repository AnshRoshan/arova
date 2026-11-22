import { readFileSync, writeFileSync } from "node:fs";

// ── board-actions: resendFromMessage ──
let a = readFileSync("src/lib/board-actions.ts", "utf8");
a = a.replace(
  'import { streamBrief } from "@/lib/brief-runner";',
  'import { streamBrief } from "@/lib/brief-runner";\nimport { streamReply as streamSeatReply } from "@/lib/chat-runner";'
);
const anchor = `  } else if (action === "promoteRunToEval") {`;
if (!a.includes(anchor)) { console.log("BRANCH ANCHOR NOT FOUND"); process.exit(1); }
a = a.replace(anchor, `  } else if (action === "resendFromMessage") {
    // Spec 50 — edit-and-resend opens a branch: the original turn stays exactly as it was
    // (append-only is an invariant), the edited turn is a new row marked as its branch, and the
    // reply runs the same path sendMessage uses.
    const input = z.object({ messageId: uuid, content: text }).parse(body);
    const [original] = await db.select().from(messages).where(and(eq(messages.id, input.messageId), eq(messages.workspaceId, workspaceId))).limit(1);
    if (!original) throw new Error("Message not found");
    if (original.role !== "user") throw new Error("Only your own question can be re-asked; assistant rows are the record of what was answered.");
    const agent = await ownedAgent(workspaceId, body.agentId);
    if (agent.status === "PAUSED") throw new Error("Resume this agent before chatting.");
    const [branched] = await db.insert(messages).values({
      workspaceId, agentId: agent.id, role: "user", content: input.content,
      metadata: { branchFrom: original.id, branchedFromContent: original.content.slice(0, 4000) },
    }).returning();
    await audit(workspaceId, agent.id, "chat.branch", \`a turn was re-asked from \${original.id.slice(0, 8)}\`);
    if (body.stream !== false) return { response: streamSeatReply(workspaceId, agent, agent.id, request.signal) };
    const reply = await buildReply(workspaceId, agent, await recentTurns(workspaceId, agent.id));
    await db.insert(messages).values({ workspaceId, agentId: agent.id, role: "assistant", ...reply });
    result = { reply, branchedId: branched.id };
  } else if (action === "promoteRunToEval") {`);
// imports needed: buildReply + recentTurns already imported? check
if (!a.includes("buildReply, streamReply")) {
  a = a.replace("import { buildReply, streamReply } from \"@/lib/chat-runner\";", "import { buildReply, streamReply } from \"@/lib/chat-runner\";");
}
writeFileSync("src/lib/board-actions.ts", a);
console.log("resend action added");

// ── UI: branch affordance + composer state ──
let g = readFileSync("src/app/page.tsx", "utf8");
g = g.replace(
  "  const [retentionForm, setRetentionForm] = useState<{ events: string; usage: string }>({ events: \"\", usage: \"\" });",
  `  const [retentionForm, setRetentionForm] = useState<{ events: string; usage: string }>({ events: "", usage: "" });
  const [branching, setBranching] = useState<{ id: string; content: string } | null>(null);`
);
g = g.replace(
  `    const content = draft.trim();
    if (!content || busy || agent?.status !== "ACTIVE") return;
    setPendingFiles([]);`,
  `    const content = draft.trim();
    if (!content || busy || agent?.status !== "ACTIVE") return;
    setPendingFiles([]);
    setBranching(null);`
);
// send(): branch when set
g = g.replace(
  '      const r = await fetch("/api/board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sendMessage", agentId: agent.id, content, stream: true, ...(pendingFiles.length ? { attachments: pendingFiles } : {}) }), signal: controller.signal });',
  '      const r = await fetch("/api/board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(branching\n        ? { action: "resendFromMessage", messageId: branching.id, agentId: agent.id, content, stream: true }\n        : { action: "sendMessage", agentId: agent.id, content, stream: true, ...(pendingFiles.length ? { attachments: pendingFiles } : {}) }), signal: controller.signal });'
);
// user entry affordance: an edit button on user rows in the seat thread. Find the user entry render.
const userEntryAnchor = `const isUser = m.role === "user";`;
if (g.includes(userEntryAnchor)) {
  g = g.replace(userEntryAnchor, userEntryAnchor + `
  const isBranched = Boolean(m.metadata?.branchFrom);`);
}
writeFileSync(file, g);
console.log("branch UI state added");
