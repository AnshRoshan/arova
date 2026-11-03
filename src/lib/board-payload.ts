import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents, approvals, channelDeliveries, channels, connections, delegations, evalResults, evalSuites, evalTasks, events, memories, messages, researchFindings, researchProjects, researchSources, routines, runSteps, runs, sandboxes, schedulerHeartbeats, teams, triggers, workspaces } from "@/db/schema";
import { sandboxProvider } from "@/lib/sandbox";
import { redactTarget } from "@/lib/channels";
import { buildRegistry, type RegistryStats } from "@/lib/registry";
import { loadProfiles, modelSelections, type ProviderProfile } from "@/lib/model-gateway";
import { normaliseCapabilities, unavailableReason } from "@/lib/tools";
import { alwaysOn, cronState, driverState, schedulerIntervalSeconds, workerEnabled } from "@/lib/worker-config";
import { loadAuthProviders } from "@/lib/auth-providers";
import { listPeople, readActor } from "@/lib/auth-sessions";
import { suitePassRate } from "@/lib/suite";
import { dailyCallLimit, num, usageToday } from "@/lib/budget";
import { maxDelegations } from "@/lib/board-core";

/** What the browser may know about a provider: never the key, and never the raw base URL. */
function publicProfiles(profiles: ProviderProfile[]) {
  return profiles.map(p => ({ name: p.name, label: p.label, model: p.model, configured: p.configured, builtIn: p.builtIn, modelPinned: Boolean(p.modelPinned), maxContextTokens: p.maxContextTokens }));
}

/** The board payload: one read of everything the workbench renders. No request state lives here. */
export async function board(workspaceId: string) {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const profiles = loadProfiles();
  // The message window is the newest rows; older history stays in Postgres and opens through the
  // loadEarlier action. The completed-runs total is counted in SQL over ALL rows, so windowing the
  // payload never changes a number the board claims.
  const MESSAGE_WINDOW = 200, RUN_WINDOW = 60, STEP_WINDOW = 300, APPROVAL_WINDOW = 60;
  const [agentList, messagePage, routineList, runList, stepList, approvalList, connectionList, sandboxList, eventList, usage, teamList, memoryList, triggerList, beats, channelList, deliveryList, evalTaskList, evalResultList, evalTotals, suiteList, researchProjectList, researchSourceList, researchFindingList, runStats, pendingStats, routineStats, totalsRows] = await Promise.all([
    db.select().from(agents).where(and(eq(agents.workspaceId, workspaceId), isNull(agents.deletedAt))).orderBy(agents.createdAt),
    db.select().from(messages).where(eq(messages.workspaceId, workspaceId)).orderBy(desc(messages.createdAt), desc(messages.id)).limit(MESSAGE_WINDOW + 1),
    db.select().from(routines).where(eq(routines.workspaceId, workspaceId)).orderBy(desc(routines.createdAt)),
    db.select().from(runs).where(eq(runs.workspaceId, workspaceId)).orderBy(desc(runs.startedAt)).limit(RUN_WINDOW),
    db.select().from(runSteps).where(eq(runSteps.workspaceId, workspaceId)).orderBy(desc(runSteps.createdAt)).limit(STEP_WINDOW),
    db.select().from(approvals).where(eq(approvals.workspaceId, workspaceId)).orderBy(desc(approvals.createdAt)).limit(APPROVAL_WINDOW),
    db.select().from(connections).where(eq(connections.workspaceId, workspaceId)),
    db.select().from(sandboxes).where(eq(sandboxes.workspaceId, workspaceId)),
    db.select().from(events).where(eq(events.workspaceId, workspaceId)).orderBy(desc(events.createdAt)).limit(30),
    usageToday(workspaceId),
    db.select().from(teams).where(eq(teams.workspaceId, workspaceId)).orderBy(teams.createdAt),
    db.select().from(memories).where(eq(memories.workspaceId, workspaceId)).orderBy(desc(memories.createdAt)),
    db.select().from(triggers).where(eq(triggers.workspaceId, workspaceId)).orderBy(desc(triggers.createdAt)),
    db.select().from(schedulerHeartbeats),
    db.select().from(channels).where(eq(channels.workspaceId, workspaceId)).orderBy(desc(channels.createdAt)),
    db.select().from(channelDeliveries).where(eq(channelDeliveries.workspaceId, workspaceId)).orderBy(desc(channelDeliveries.createdAt)).limit(40),
    db.select().from(evalTasks).where(eq(evalTasks.workspaceId, workspaceId)).orderBy(desc(evalTasks.createdAt)),
    db.select().from(evalResults).where(eq(evalResults.workspaceId, workspaceId)).orderBy(desc(evalResults.createdAt)).limit(100),
    // The pass rate is the whole workspace's record, not whatever fits in the 100-row window the
    // board shows. The registry already refuses windowed counts; evals use the same rule.
    db.select({
      attempts: sql<number>`count(*)::int`,
      passed: sql<number>`(count(*) filter (where ${evalResults.status} = 'PASS'))::int`,
      failed: sql<number>`(count(*) filter (where ${evalResults.status} = 'FAIL'))::int`,
      skipped: sql<number>`(count(*) filter (where ${evalResults.status} = 'SKIPPED'))::int`,
      medianMs: sql<number | null>`(percentile_cont(0.5) within group (order by ${evalResults.durationMs}) filter (where ${evalResults.status} in ('PASS', 'FAIL')))`,
    }).from(evalResults).where(eq(evalResults.workspaceId, workspaceId)),
    db.select().from(evalSuites).where(eq(evalSuites.workspaceId, workspaceId)).orderBy(desc(evalSuites.createdAt)),
    db.select().from(researchProjects).where(eq(researchProjects.workspaceId, workspaceId)).orderBy(desc(researchProjects.createdAt)),
    db.select().from(researchSources).where(eq(researchSources.workspaceId, workspaceId)).orderBy(desc(researchSources.pinned), desc(researchSources.createdAt)).limit(500),
    db.select().from(researchFindings).where(eq(researchFindings.workspaceId, workspaceId)).orderBy(desc(researchFindings.createdAt)).limit(500),
    db.select({
      agentId: runs.agentId,
      count: sql<number>`count(*)::int`,
      lastAt: sql<Date | null>`max(${runs.startedAt})`,
      lastStatus: sql<string | null>`(array_agg(${runs.status} order by ${runs.startedAt} desc))[1]`,
    }).from(runs).where(eq(runs.workspaceId, workspaceId)).groupBy(runs.agentId),
    db.select({ agentId: approvals.agentId, count: sql<number>`count(*)::int` }).from(approvals)
      .where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.status, "PENDING"))).groupBy(approvals.agentId),
    db.select({ agentId: routines.agentId, count: sql<number>`count(*)::int` }).from(routines)
      .where(and(eq(routines.workspaceId, workspaceId), eq(routines.enabled, true))).groupBy(routines.agentId),
    db.select({
      n: sql<number>`(select count(*)::int from runs where workspace_id = ${workspaceId} and status = 'COMPLETED' and summary not like 'Sample run:%')`,
      today: sql<number>`(select count(*)::int from messages where workspace_id = ${workspaceId} and role = 'user' and created_at >= date_trunc('day', now() at time zone 'utc'))`,
      pending: sql<number>`(select count(*)::int from approvals where workspace_id = ${workspaceId} and status = 'PENDING' and detail not like 'Sample approval%')`,
    }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1),
  ]);
  const olderMessages = messagePage.length > MESSAGE_WINDOW;
  const messageList = (olderMessages ? messagePage.slice(0, MESSAGE_WINDOW) : messagePage).reverse();
  const completedRunsCount = totalsRows[0]?.n ?? 0;
  const messagesTodayCount = totalsRows[0]?.today ?? 0;
  const pendingApprovalsCount = totalsRows[0]?.pending ?? 0;
  // The registry's counts are exact aggregates, not the 60-row board window.
  const registryStats = new Map<string, RegistryStats>();
  const statFor = (agentId: string) => registryStats.get(agentId) ?? { lastRunAt: null, lastRunStatus: null, runCount: 0, pendingApprovals: 0, routineCount: 0 };
  for (const row of runStats) registryStats.set(row.agentId, { ...statFor(row.agentId), lastRunAt: row.lastAt, lastRunStatus: row.lastStatus, runCount: Number(row.count) });
  for (const row of pendingStats) registryStats.set(row.agentId, { ...statFor(row.agentId), pendingApprovals: Number(row.count) });
  for (const row of routineStats) registryStats.set(row.agentId, { ...statFor(row.agentId), routineCount: Number(row.count) });
  // A consult card must still show the peer's answer the day after it happened. The day window is
  // there to keep the index's "today" list small — it was never meant to erase stored evidence.
  const startOfUtcDay = new Date(new Date().toISOString().slice(0, 10));
  const consultedMessageIds = messageList.filter(m => Array.isArray((m.metadata as Record<string, unknown> | null)?.consulted)).map(m => m.id);
  const delegationList = await db.select().from(delegations)
    .where(and(eq(delegations.workspaceId, workspaceId), or(gte(delegations.createdAt, startOfUtcDay), consultedMessageIds.length ? inArray(delegations.messageId, consultedMessageIds) : sql`false`)))
    .orderBy(desc(delegations.createdAt)).limit(80);
  return {
    workspace,
    olderMessages,
    overview: {
      activeAgents: agentList.filter(a => a.status === "ACTIVE").length,
      enabledRoutines: routineList.filter(r => r.enabled).length,
      completedRuns: completedRunsCount,
      pendingApprovals: pendingApprovalsCount,
      messagesToday: messagesTodayCount,
    },
    agents: agentList.map(a => ({ ...a, capabilities: normaliseCapabilities(a.capabilities) })), messages: messageList, routines: routineList, runs: runList, steps: stepList, approvals: approvalList, connections: connectionList, sandboxes: sandboxList, events: eventList, memories: memoryList, triggers: triggerList,
    // The target is a credential, so the browser gets its host and never its path or query.
    channels: channelList.map(c => ({
      id: c.id, teamId: c.teamId, name: c.name, kind: c.kind, targetHost: redactTarget(c.target), token: c.token,
      enabled: c.enabled, lastDeliveryAt: c.lastDeliveryAt?.toISOString() ?? null, lastStatus: c.lastStatus,
      lastError: c.lastError, delivered: c.delivered, failed: c.failed, lastInboundAt: c.lastInboundAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
    channelDeliveries: deliveryList.map(d => ({
      id: d.id, channelId: d.channelId, direction: d.direction, event: d.event, status: d.status,
      detail: d.detail, runId: d.runId, createdAt: d.createdAt.toISOString(),
    })),
    evals: {
      tasks: evalTaskList.map(t => ({ id: t.id, agentId: t.agentId, name: t.name, prompt: t.prompt, expected: t.expected, createdAt: t.createdAt.toISOString() })),
      results: evalResultList.map(r => ({ id: r.id, taskId: r.taskId, agentId: r.agentId, runId: r.runId, status: r.status, score: r.score, detail: r.detail, durationMs: r.durationMs, createdAt: r.createdAt.toISOString() })),
      suites: suiteList.map(s => ({
        id: s.id, agentId: s.agentId, name: s.name, taskIds: s.taskIds, callCeiling: s.callCeiling, status: s.status,
        passed: s.passed, failed: s.failed, skipped: s.skipped, errored: s.errored, modelCalls: s.modelCalls,
        passRate: suitePassRate(s), startedAt: s.startedAt?.toISOString() ?? null, finishedAt: s.finishedAt?.toISOString() ?? null, createdAt: s.createdAt.toISOString(),
      })),
      summary: (() => {
        const totals = evalTotals[0];
        const passed = Number(totals?.passed ?? 0), failed = Number(totals?.failed ?? 0);
        const scored = passed + failed;
        return {
          attempts: Number(totals?.attempts ?? 0), passed, failed,
          skipped: Number(totals?.skipped ?? 0),
          passRate: scored ? passed / scored : null,
          medianMs: totals?.medianMs == null ? null : Math.round(Number(totals.medianMs)),
        };
      })(),
    },
    research: {
      projects: researchProjectList.map(p => ({
        id: p.id, name: p.name, question: p.question, status: p.status, agentId: p.agentId, teamId: p.teamId,
        createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
        sourceCount: researchSourceList.filter(s => s.projectId === p.id).length,
        findingCount: researchFindingList.filter(f => f.projectId === p.id).length,
      })),
      sources: researchSourceList.map(s => ({
        id: s.id, projectId: s.projectId, url: s.url, host: s.host, title: s.title, excerpt: s.excerpt,
        note: s.note, tag: s.tag, pinned: s.pinned, addedBy: s.addedBy,
        fetchedAt: s.fetchedAt?.toISOString() ?? null, createdAt: s.createdAt.toISOString(),
      })),
      findings: researchFindingList.map(f => ({ id: f.id, projectId: f.projectId, text: f.text, sourceIds: f.sourceIds, createdAt: f.createdAt.toISOString() })),
    },
    registry: buildRegistry(agentList, teamList, registryStats),
    scheduler: (() => {
      const now = new Date();
      const interval = schedulerIntervalSeconds();
      const enabled = workerEnabled();
      const cronConfigured = Boolean(process.env.CRON_SECRET);
      const w = beats.find(b => b.source === "worker") ?? null;
      const c = beats.find(b => b.source === "cron") ?? null;
      const worker = driverState(w, interval, now, enabled);
      const cron = cronState(c, cronConfigured, now);
      return { headline: alwaysOn(worker, cron), now: now.toISOString(), intervalSeconds: interval, worker: { enabled, state: worker, beat: w }, cron: { configured: cronConfigured, state: cron, beat: c } };
    })(),
    sandboxProvider: sandboxProvider.name,
    sandbox: { provider: sandboxProvider.name, capabilities: sandboxProvider.capabilities },
    toolNotes: {
      browser: unavailableReason("browser", { sandboxActive: sandboxProvider.name !== "unconfigured" }),
      run_command: unavailableReason("run_command", { sandboxActive: sandboxProvider.name !== "unconfigured" }),
    },
    profiles: publicProfiles(profiles),
    providers: Object.fromEntries(profiles.map(p => [p.name, p.configured])) as Record<string, boolean>,
    modelConfigured: profiles.some(p => p.configured),
    modelSelections: modelSelections(),
    teams: teamList,
    delegations: delegationList,
    limits: { dailyModelCalls: dailyCallLimit(), usage, maxDelegations: maxDelegations() },
    // Names only: what the sign-in screen would build itself from, and what a half-configured
    // provider is missing. A secret never appears here — this whole payload goes to the browser.
    auth: (() => { const d = loadAuthProviders(process.env); return { providers: d.providers.map(p => ({ name: p.name, label: p.label })), incomplete: d.incomplete }; })(),
    // Who the request is, and — for the owner — who else is in. The people list carries no tokens,
    // no issuers' raw subjects beyond an opaque id, and reaches only the member whose role is owner.
    identity: await (async () => {
      const actor = await readActor();
      if (!actor) return { signedIn: null, people: [] as { id: string; name: string; email: string; role: string; addedAt: string; lastSeenAt: string | null; sessions: number }[] };
      const people = actor.role === "owner" ? (await listPeople(workspaceId)).map(p => ({ id: p.id, name: p.name, email: p.email, role: p.role, addedAt: p.addedAt.toISOString(), lastSeenAt: p.lastSeenAt?.toISOString() ?? null, sessions: p.sessions })) : [];
      return { signedIn: { name: actor.name, email: actor.email, role: actor.role }, people };
    })(),
  };
}
