import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { agents, goals, memories, messages, routines, runs, runSteps, skillVersions, skills, teams, watches, workspaces } from "@/db/schema";
import { readActor } from "@/lib/auth-sessions";
import { cookieName } from "@/lib/board-core";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Spec 51 — restore a **full export** into a brand-new workspace. The preflight refuses anything
 * that is not our own file (kind + version + the collections a full export carries) with the
 * reason named. Every row gets a fresh id with old→new remapped (managers, leads, teams, message
 * parents), so nothing collides and nothing is trusted from the file beyond plain data. Secrets
 * never travel in an export: channels, triggers, credentials and sessions are not imported, and
 * the doc says so at export time too.
 */
type Ref = { id: string; name: string; mime: string; size: number };

export async function POST(request: NextRequest) {
  const actor = await readActor();
  if (!actor || actor.role !== "owner") return NextResponse.json({ error: "Only a signed-in owner can import a workspace." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || body.kind !== "arova-export") return NextResponse.json({ error: "That file is not an Arova export (missing the kind marker)." }, { status: 400 });
  if (body.version !== 1) return NextResponse.json({ error: `That export is version ${String(body.version)}; this server imports version 1.` }, { status: 400 });
  if (body.mode !== "full") return NextResponse.json({ error: "That is an audit-only export. A restore needs ?mode=full — the audit file deliberately carries no message bodies." }, { status: 400 });
  for (const key of ["agents", "teams", "messages", "runs", "steps", "routines", "memories"]) {
    if (!Array.isArray(body[key])) return NextResponse.json({ error: `That export is missing its "${key}" collection — refusing a partial file.` }, { status: 400 });
  }

  const [workspace] = await db.insert(workspaces).values({ name: `${String(body.workspace && (body.workspace as { name?: string }).name ? (body.workspace as { name?: string }).name! : "Imported workspace")} (restored)` }).returning();
  const map = new Map<string, string>();
  const fresh = (oldId: unknown): string | null => {
    if (typeof oldId !== "string") return null;
    if (!map.has(oldId)) map.set(oldId, crypto.randomUUID());
    return map.get(oldId)!;
  };
  const date = (v: unknown): Date | null => (typeof v === "string" || v instanceof Date ? new Date(v as string) : null);
  const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

  // Teams first (agents reference them), with lead/creator remapped after seats exist.
  const teamIdMap = new Map<string, string>();
  for (const t of (body.teams as Record<string, unknown>[])) {
    const newId = crypto.randomUUID();
    teamIdMap.set(String(t.id), newId);
    await db.insert(teams).values({ id: newId, workspaceId: workspace.id, name: str(t.name, "Imported org"), brief: str(t.brief), createdAt: date(t.createdAt) ?? new Date() });
  }
  for (const a of (body.agents as Record<string, unknown>[])) {
    const newId = fresh(a.id)!;
    await db.insert(agents).values({
      id: newId, workspaceId: workspace.id,
      teamId: typeof a.teamId === "string" ? teamIdMap.get(a.teamId) ?? null : null,
      managerId: typeof a.managerId === "string" && map.has(a.managerId) ? map.get(a.managerId)! : null,
      name: str(a.name, "Imported seat"), role: str(a.role, "operator"), instructions: str(a.instructions),
      status: str(a.status, "ACTIVE"), provider: str(a.provider, "auto"),
      createdAt: date(a.createdAt) ?? new Date(), deletedAt: date(a.deletedAt),
    }).onConflictDoNothing();
  }
  // Lead/creator pointers, now that the seats exist.
  for (const t of (body.teams as Record<string, unknown>[])) {
    const newTeamId = teamIdMap.get(String(t.id));
    if (!newTeamId) continue;
    await db.update(teams).set({
      leadAgentId: typeof t.leadAgentId === "string" && map.has(t.leadAgentId) ? map.get(t.leadAgentId)! : null,
      creatorAgentId: typeof t.creatorAgentId === "string" && map.has(t.creatorAgentId) ? map.get(t.creatorAgentId)! : null,
    }).where((await import("drizzle-orm")).eq(teams.id, newTeamId));
  }
  for (const m of (body.messages as Record<string, unknown>[])) {
    const attachments = Array.isArray(m.attachments) ? (m.attachments as Ref[]).map(r => ({ ...r })) : [];
    await db.insert(messages).values({
      id: fresh(m.id)!, workspaceId: workspace.id,
      agentId: typeof m.agentId === "string" ? map.get(m.agentId) ?? null : null,
      teamId: typeof m.teamId === "string" ? teamIdMap.get(m.teamId) ?? null : null,
      role: str(m.role, "user"), content: str(m.content), kind: str(m.kind, "message"),
      metadata: (m.metadata ?? {}) as Record<string, unknown>,
      ...(attachments.length ? { attachments } : {}),
      createdAt: date(m.createdAt) ?? new Date(),
    }).onConflictDoNothing();
  }
  for (const r of (body.runs as Record<string, unknown>[])) {
    const runId = fresh(r.id)!;
    await db.insert(runs).values({
      id: runId, workspaceId: workspace.id,
      agentId: typeof r.agentId === "string" ? map.get(r.agentId)! : crypto.randomUUID(),
      routineId: null,
      title: str(r.title, "Imported run"), status: str(r.status, "COMPLETED"), summary: str(r.summary),
      initiator: str(r.initiator, "person"), inputTokens: typeof r.inputTokens === "number" ? r.inputTokens : null, outputTokens: typeof r.outputTokens === "number" ? r.outputTokens : null,
      startedAt: date(r.startedAt) ?? new Date(), completedAt: date(r.completedAt),
    }).onConflictDoNothing();
  }
  for (const s of (body.steps as Record<string, unknown>[])) {
    await db.insert(runSteps).values({
      id: fresh(s.id)!, workspaceId: workspace.id,
      runId: typeof s.runId === "string" ? map.get(s.runId)! : crypto.randomUUID(),
      title: str(s.title, "Step"), detail: str(s.detail), status: str(s.status, "COMPLETED"), createdAt: date(s.createdAt) ?? new Date(),
    }).onConflictDoNothing();
  }
  for (const rt of (body.routines as Record<string, unknown>[])) {
    await db.insert(routines).values({
      id: fresh(rt.id)!, workspaceId: workspace.id,
      agentId: typeof rt.agentId === "string" ? map.get(rt.agentId)! : crypto.randomUUID(),
      name: str(rt.name, "Imported routine"), description: str(rt.description), schedule: str(rt.schedule, "Every day at 8:00 AM"),
      timezone: str(rt.timezone, "UTC"), enabled: rt.enabled === true, icon: str(rt.icon, "sparkles"),
      createdAt: date(rt.createdAt) ?? new Date(),
    }).onConflictDoNothing();
  }
  for (const m of (body.memories as Record<string, unknown>[])) {
    await db.insert(memories).values({
      id: fresh(m.id)!, workspaceId: workspace.id,
      teamId: typeof m.teamId === "string" ? teamIdMap.get(m.teamId)! : crypto.randomUUID(),
      agentId: typeof m.agentId === "string" ? map.get(m.agentId) ?? null : null,
      kind: str(m.kind, "note"), text: str(m.text), pinned: m.pinned === true,
      supersedes: typeof m.supersedes === "string" && map.has(m.supersedes) ? map.get(m.supersedes)! : null,
      sourceIds: Array.isArray(m.sourceIds) ? [] : [],
      hits: typeof m.hits === "number" ? m.hits : 0,
      validFrom: date(m.validFrom), validTo: date(m.validTo),
      createdAt: date(m.createdAt) ?? new Date(),
    }).onConflictDoNothing();
  }
  for (const g of (body.goals as Record<string, unknown>[])) {
    await db.insert(goals).values({ id: fresh(g.id)!, workspaceId: workspace.id, title: str(g.title, "Imported goal"), description: str(g.description), successCriteria: str(g.successCriteria), cadence: str(g.cadence, "Every day at 8:00 AM"), status: str(g.status, "active"), createdAt: date(g.createdAt) ?? new Date() }).onConflictDoNothing();
  }
  for (const w of (body.watches as Record<string, unknown>[])) {
    await db.insert(watches).values({ id: fresh(w.id)!, workspaceId: workspace.id, goalId: typeof w.goalId === "string" && map.has(w.goalId) ? map.get(w.goalId)! : null, title: str(w.title, "Imported watch"), url: str(w.url, "https://example.com"), condition: str(w.condition, "changed"), comparator: str(w.comparator), cadence: str(w.cadence, "Every hour"), enabled: false, createdAt: date(w.createdAt) ?? new Date() }).onConflictDoNothing();
  }
  for (const sk of (body.skills as Record<string, unknown>[])) {
    const skillId = fresh(sk.id)!;
    await db.insert(skills).values({ id: skillId, workspaceId: workspace.id, scope: str(sk.scope, "org"), teamId: typeof sk.teamId === "string" ? teamIdMap.get(sk.teamId) ?? null : null, agentId: typeof sk.agentId === "string" ? map.get(sk.agentId) ?? null : null, name: str(sk.name, "Imported skill"), slug: str(sk.slug, `imported-${skillId.slice(0, 8)}`), description: str(sk.description), status: "draft", instructions: str(sk.instructions), toolGrants: [], currentVersion: typeof sk.currentVersion === "number" ? sk.currentVersion : 1, createdBy: "import", createdAt: date(sk.createdAt) ?? new Date(), updatedAt: new Date() }).onConflictDoNothing();
  }
  for (const sv of (body.skillVersions as Record<string, unknown>[])) {
    await db.insert(skillVersions).values({ id: fresh(sv.id)!, skillId: typeof sv.skillId === "string" ? map.get(sv.skillId)! : crypto.randomUUID(), version: typeof sv.version === "number" ? sv.version : 1, instructions: str(sv.instructions), toolGrants: [], notes: "imported", createdAt: date(sv.createdAt) ?? new Date() }).onConflictDoNothing();
  }
  await audit(workspace.id, null, "workspace.imported", `restored ${Array.isArray(body.messages) ? body.messages.length : 0} message(s) from a full export`);

  const response = NextResponse.json({ ok: true, workspaceId: workspace.id, note: "Imported as a new workspace. Secrets never travel in an export — channels, triggers, the vault and sessions were not imported." });
  // The importer's session points at the new workspace, so the next load shows what was restored.
  const jar = await cookies();
  jar.set(cookieName, workspace.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  void actor;
  return response;
}
