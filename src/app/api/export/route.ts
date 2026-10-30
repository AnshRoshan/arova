import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, approvals, channels, delegations, events, externalEffects, memories, runs, runSteps, sandboxes, teams, workspaces } from "@/db/schema";
import { readActor } from "@/lib/auth-sessions";
import { redactTarget } from "@/lib/channels";

export const dynamic = "force-dynamic";

const COOKIE = "arova_workspace";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 5000;

/**
 * A workspace audit export. It is deliberately narrower than a database dump: no message bodies,
 * no channel target URLs or inbound tokens, no model keys, no session tokens, no agent instructions, and no typed sandbox commands.
 * The caller is the workspace that already sees these rows; the file is for a human or an auditor.
 */
export async function GET() {
  const actor = await readActor();
  const cookie = (await cookies()).get(COOKIE)?.value;
  const workspaceId = actor?.workspaceId ?? (cookie && UUID.test(cookie) ? cookie : null);
  if (!workspaceId) return NextResponse.json({ error: "No workspace session." }, { status: 401 });

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) return NextResponse.json({ error: "Workspace not found." }, { status: 401 });

  const [agentRows, teamRows, eventRows, runRows, stepRows, approvalRows, delegationRows, memoryRows, channelRows, sandboxRows, effectRows] = await Promise.all([
    db.select().from(agents).where(eq(agents.workspaceId, workspaceId)),
    db.select().from(teams).where(eq(teams.workspaceId, workspaceId)),
    db.select().from(events).where(eq(events.workspaceId, workspaceId)).orderBy(desc(events.createdAt)).limit(LIMIT),
    db.select().from(runs).where(eq(runs.workspaceId, workspaceId)).orderBy(desc(runs.startedAt)).limit(LIMIT),
    db.select().from(runSteps).where(eq(runSteps.workspaceId, workspaceId)).orderBy(desc(runSteps.createdAt)).limit(LIMIT),
    db.select().from(approvals).where(eq(approvals.workspaceId, workspaceId)).orderBy(desc(approvals.createdAt)).limit(LIMIT),
    db.select().from(delegations).where(eq(delegations.workspaceId, workspaceId)).orderBy(desc(delegations.createdAt)).limit(LIMIT),
    db.select().from(memories).where(eq(memories.workspaceId, workspaceId)).orderBy(desc(memories.createdAt)).limit(LIMIT),
    db.select().from(channels).where(eq(channels.workspaceId, workspaceId)).orderBy(desc(channels.createdAt)),
    db.select().from(sandboxes).where(eq(sandboxes.workspaceId, workspaceId)),
    db.select().from(externalEffects).where(eq(externalEffects.workspaceId, workspaceId)).orderBy(desc(externalEffects.createdAt)).limit(LIMIT),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    note: "Audit export. Message bodies, channel target URLs and inbound tokens, model keys, session tokens and agent instructions are excluded.",
    workspace: { id: workspace.id, name: workspace.name, timezone: workspace.timezone },
    agents: agentRows.map(a => ({ id: a.id, name: a.name, role: a.role, status: a.status, teamId: a.teamId, managerId: a.managerId, provider: a.provider, createdAt: a.createdAt, deletedAt: a.deletedAt })),
    teams: teamRows.map(t => ({ id: t.id, name: t.name, brief: t.brief, leadAgentId: t.leadAgentId, creatorAgentId: t.creatorAgentId, createdAt: t.createdAt })),
    events: eventRows,
    runs: runRows,
    steps: stepRows,
    approvals: approvalRows,
    delegations: delegationRows,
    memories: memoryRows.map(m => ({ id: m.id, teamId: m.teamId, agentId: m.agentId, kind: m.kind, text: m.text, pinned: m.pinned, supersedes: m.supersedes, sourceIds: m.sourceIds, hits: m.hits, lastUsedAt: m.lastUsedAt, createdAt: m.createdAt })),
    channels: channelRows.map(c => ({ name: c.name, kind: c.kind, targetHost: redactTarget(c.target), teamId: c.teamId, enabled: c.enabled, delivered: c.delivered, failed: c.failed, lastStatus: c.lastStatus, lastError: c.lastError, lastDeliveryAt: c.lastDeliveryAt, lastInboundAt: c.lastInboundAt, createdAt: c.createdAt })),
    sandboxes: sandboxRows.map(s => ({ agentId: s.agentId, provider: s.provider, status: s.status, createdAt: s.createdAt })),
    // The ledger is exported as evidence, but a stored command is typed input: the export keeps the
    // fact of the attempt and the key, not the text that was typed.
    externalEffects: effectRows.map(e => ({
      id: e.id, runId: e.runId, agentVersionId: e.agentVersionId, idempotencyKey: e.idempotencyKey,
      kind: e.kind, status: e.status, createdAt: e.createdAt,
      metadata: Object.fromEntries(Object.entries(e.metadata ?? {}).map(([key, value]) => [key, key === "command" ? "[redacted from export]" : value])),
    })),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="arova-audit-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
