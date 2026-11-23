import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents, approvals, attentionItems, channels, delegations, events, externalEffects, goals, memories, messages, researchFindings, researchProjects, researchSources, routines, runs, runSteps, sandboxes, skillVersions, skills, teams, watches, workspaces } from "@/db/schema";
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
/**
 * Spec 51 — `?mode=full` adds the collections a restore needs (messages with bodies, routines,
 * watches, goals, attention items, skills and their versions, plus the workspace row). Secrets
 * still never travel: no channel targets or inbound tokens, no vault envelopes, no trigger tokens,
 * no sessions. Import is the inverse (`/api/import`, owner-only, always into a NEW workspace).
 */
export async function GET(request: Request) {
  const mode = new URL(request.url).searchParams.get("mode");
  const actor = await readActor();
  const cookie = (await cookies()).get(COOKIE)?.value;
  const workspaceId = actor?.workspaceId ?? (cookie && UUID.test(cookie) ? cookie : null);
  if (!workspaceId) return NextResponse.json({ error: "No workspace session." }, { status: 401 });

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) return NextResponse.json({ error: "Workspace not found." }, { status: 401 });

  const [agentRows, teamRows, eventRows, runRows, stepRows, approvalRows, delegationRows, memoryRows, channelRows, sandboxRows, effectRows, researchProjectRows, researchSourceRows, researchFindingRows, messageRows, routineRows, goalRows, watchRows, attentionRows, skillRows, skillVersionRows] = await Promise.all([
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
    db.select().from(researchProjects).where(eq(researchProjects.workspaceId, workspaceId)).orderBy(desc(researchProjects.createdAt)).limit(LIMIT),
    db.select().from(researchSources).where(eq(researchSources.workspaceId, workspaceId)).orderBy(desc(researchSources.createdAt)).limit(LIMIT),
    db.select().from(researchFindings).where(eq(researchFindings.workspaceId, workspaceId)).orderBy(desc(researchFindings.createdAt)).limit(LIMIT),
    ...(mode === "full" ? [db.select().from(messages).where(eq(messages.workspaceId, workspaceId)).orderBy(desc(messages.createdAt)).limit(LIMIT)] : [[]]),
    ...(mode === "full" ? [db.select().from(routines).where(eq(routines.workspaceId, workspaceId)).orderBy(desc(routines.createdAt)).limit(LIMIT)] : [[]]),
    ...(mode === "full" ? [db.select().from(goals).where(eq(goals.workspaceId, workspaceId)).limit(LIMIT)] : [[]]),
    ...(mode === "full" ? [db.select().from(watches).where(eq(watches.workspaceId, workspaceId)).limit(LIMIT)] : [[]]),
    ...(mode === "full" ? [db.select().from(attentionItems).where(eq(attentionItems.workspaceId, workspaceId)).orderBy(desc(attentionItems.createdAt)).limit(LIMIT)] : [[]]),
    ...(mode === "full" ? [db.select().from(skills).where(eq(skills.workspaceId, workspaceId)).limit(LIMIT)] : [[]]),
    ...(mode === "full" ? [db.select().from(skillVersions).where(sql`${skillVersions.skillId} in (select id from skills where workspace_id = ${workspaceId})`).limit(LIMIT)] : [[]]),
  ]);

  const payload = {
    kind: "arova-export" as const,
    version: 1 as const,
    mode: mode === "full" ? ("full" as const) : ("audit" as const),
    exportedAt: new Date().toISOString(),
    note: mode === "full"
      ? "Full export for restore. Secrets never travel: no channel targets or inbound tokens, no vault envelopes, no trigger tokens, no sessions. Import creates a NEW workspace."
      : "Audit export. Message bodies, channel target URLs and inbound tokens, model keys, session tokens and agent instructions are excluded.",
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
    research: {
      projects: researchProjectRows,
      sources: researchSourceRows,
      findings: researchFindingRows,
    },
    // The ledger is exported as evidence, but a stored command is typed input: the export keeps the
    // fact of the attempt and the key, not the text that was typed.
    ...(mode === "full" ? {
      messages: messageRows as unknown as Record<string, unknown>[],
      routines: (routineRows as unknown as Record<string, unknown>[]).map(rt => ({ id: rt.id, agentId: rt.agentId, name: rt.name, description: rt.description, schedule: rt.schedule, timezone: rt.timezone, enabled: rt.enabled, icon: rt.icon, createdAt: rt.createdAt })),
      goals: goalRows as unknown as Record<string, unknown>[],
      watches: (watchRows as unknown as Record<string, unknown>[]).map(w => ({ ...w, token: undefined })),
      attentionItems: attentionRows as unknown as Record<string, unknown>[],
      skills: skillRows as unknown as Record<string, unknown>[],
      skillVersions: skillVersionRows as unknown as Record<string, unknown>[],
    } : {}),
    externalEffects: effectRows.map(e => ({
      id: e.id, runId: e.runId, agentVersionId: e.agentVersionId, idempotencyKey: e.idempotencyKey,
      kind: e.kind, status: e.status, createdAt: e.createdAt,
      metadata: Object.fromEntries(Object.entries(e.metadata ?? {}).map(([key, value]) => [key, key === "command" ? "[redacted from export]" : value])),
    })),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="arova-${mode === "full" ? "full" : "audit"}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
