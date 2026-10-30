import io

p = "src/app/api/board/route.ts"
s = io.open(p, encoding="utf-8").read()

s = s.replace(
    'import { agents, approvals, channelDeliveries, channels, connections, delegations, evalResults, evalSuites, evalTasks, events, memories, messages, modelUsage, routines, runs, runSteps, sandboxes, schedulerHeartbeats, teams, triggers, workspaces } from "@/db/schema";',
    'import { agents, approvals, channelDeliveries, channels, connections, delegations, evalResults, evalSuites, evalTasks, events, memories, messages, modelUsage, researchFindings, researchProjects, researchSources, routines, runs, runSteps, sandboxes, schedulerHeartbeats, teams, triggers, workspaces } from "@/db/schema";',
)
s = s.replace(
    'import { runSuiteTasks, suitePassRate } from "@/lib/suite";',
    'import { runSuiteTasks, suitePassRate } from "@/lib/suite";\nimport { collectResearchSource } from "@/lib/research-store";',
)

s = s.replace(
    "const [agentList, messagePage, routineList, runList, stepList, approvalList, connectionList, sandboxList, eventList, usage, teamList, memoryList, triggerList, beats, channelList, deliveryList, evalTaskList, evalResultList, evalTotals, suiteList, runStats, pendingStats, routineStats, totalsRows] = await Promise.all([",
    "const [agentList, messagePage, routineList, runList, stepList, approvalList, connectionList, sandboxList, eventList, usage, teamList, memoryList, triggerList, beats, channelList, deliveryList, evalTaskList, evalResultList, evalTotals, suiteList, researchProjectList, researchSourceList, researchFindingList, runStats, pendingStats, routineStats, totalsRows] = await Promise.all([",
)
s = s.replace(
    "    db.select().from(evalSuites).where(eq(evalSuites.workspaceId, workspaceId)).orderBy(desc(evalSuites.createdAt)),",
    """    db.select().from(evalSuites).where(eq(evalSuites.workspaceId, workspaceId)).orderBy(desc(evalSuites.createdAt)),
    db.select().from(researchProjects).where(eq(researchProjects.workspaceId, workspaceId)).orderBy(desc(researchProjects.createdAt)),
    db.select().from(researchSources).where(eq(researchSources.workspaceId, workspaceId)).orderBy(desc(researchSources.pinned), desc(researchSources.createdAt)).limit(500),
    db.select().from(researchFindings).where(eq(researchFindings.workspaceId, workspaceId)).orderBy(desc(researchFindings.createdAt)).limit(500),""",
)

s = s.replace(
    "    registry: buildRegistry(agentList, teamList, registryStats),",
    """    research: {
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
    registry: buildRegistry(agentList, teamList, registryStats),""",
)

marker = '    } else if (action === "createTeam") {'
actions = '''    } else if (action === "createResearchProject") {
      const input = z.object({ name: z.string().trim().min(1).max(80), question: z.string().trim().max(1000).default(""), agentId: uuid.optional(), teamId: uuid.optional() }).parse(body);
      if (input.agentId) await ownedAgent(workspaceId, input.agentId);
      if (input.teamId) {
        const [team] = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.id, input.teamId), eq(teams.workspaceId, workspaceId))).limit(1);
        if (!team) throw new Error("Organisation not found");
      }
      const [project] = await db.insert(researchProjects).values({ workspaceId, name: input.name, question: input.question, agentId: input.agentId ?? null, teamId: input.teamId ?? null }).returning();
      await audit(workspaceId, input.agentId ?? null, "research.project.created", project.name);
      result = { projectId: project.id };
    } else if (action === "updateResearchProject") {
      const input = z.object({
        projectId: uuid, name: z.string().trim().min(1).max(80).optional(), question: z.string().trim().max(1000).optional(),
        status: z.enum(["ACTIVE", "ARCHIVED"]).optional(), agentId: uuid.nullable().optional(), teamId: uuid.nullable().optional(),
      }).parse(body);
      const [project] = await db.select().from(researchProjects).where(and(eq(researchProjects.id, input.projectId), eq(researchProjects.workspaceId, workspaceId))).limit(1);
      if (!project) throw new Error("Research project not found");
      if (input.agentId) await ownedAgent(workspaceId, input.agentId);
      await db.update(researchProjects).set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.question !== undefined ? { question: input.question } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
        ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
        updatedAt: new Date(),
      }).where(eq(researchProjects.id, project.id));
      await audit(workspaceId, project.agentId, "research.project.updated", project.name + (input.status ? `: ${input.status.toLowerCase()}` : ""));
    } else if (action === "deleteResearchProject") {
      const projectId = uuid.parse(body.projectId);
      const [project] = await db.select().from(researchProjects).where(and(eq(researchProjects.id, projectId), eq(researchProjects.workspaceId, workspaceId))).limit(1);
      if (!project) throw new Error("Research project not found");
      await db.delete(researchProjects).where(eq(researchProjects.id, project.id));
      await audit(workspaceId, project.agentId, "research.project.deleted", project.name);
    } else if (action === "addResearchSource") {
      const input = z.object({
        projectId: uuid, url: z.string().trim().max(2000).optional(), text: z.string().max(20_000).optional(),
        title: z.string().trim().max(300).optional(), note: z.string().max(600).optional(), tag: z.string().trim().max(40).optional(),
      }).parse(body);
      const [project] = await db.select().from(researchProjects).where(and(eq(researchProjects.id, input.projectId), eq(researchProjects.workspaceId, workspaceId))).limit(1);
      if (!project) throw new Error("Research project not found");
      const collected = await collectResearchSource({ ...input, workspaceId });
      if (!collected.ok) throw new Error(collected.error);
      await db.update(researchProjects).set({ updatedAt: new Date() }).where(eq(researchProjects.id, project.id));
      await audit(workspaceId, project.agentId, "research.source.added", `${project.name}: ${collected.source.title || collected.source.host || "pasted note"}`);
      result = { sourceId: collected.source.id, kind: collected.kind };
    } else if (action === "updateResearchSource") {
      const input = z.object({ sourceId: uuid, pinned: z.boolean().optional(), note: z.string().max(600).optional(), tag: z.string().trim().max(40).optional() }).parse(body);
      const [source] = await db.select().from(researchSources).where(and(eq(researchSources.id, input.sourceId), eq(researchSources.workspaceId, workspaceId))).limit(1);
      if (!source) throw new Error("Source not found");
      await db.update(researchSources).set({
        ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
        ...(input.note !== undefined ? { note: input.note.trim() } : {}),
        ...(input.tag !== undefined ? { tag: input.tag } : {}),
      }).where(eq(researchSources.id, source.id));
      await audit(workspaceId, null, "research.source.updated", source.title || source.url || "pasted note");
    } else if (action === "deleteResearchSource") {
      const sourceId = uuid.parse(body.sourceId);
      const [source] = await db.select().from(researchSources).where(and(eq(researchSources.id, sourceId), eq(researchSources.workspaceId, workspaceId))).limit(1);
      if (!source) throw new Error("Source not found");
      await db.delete(researchSources).where(eq(researchSources.id, source.id));
      await audit(workspaceId, null, "research.source.deleted", source.title || source.url || "pasted note");
    } else if (action === "saveResearchFinding") {
      const input = z.object({ projectId: uuid, text: z.string().trim().min(3).max(2000), sourceIds: z.array(uuid).max(30).default([]) }).parse(body);
      const [project] = await db.select().from(researchProjects).where(and(eq(researchProjects.id, input.projectId), eq(researchProjects.workspaceId, workspaceId))).limit(1);
      if (!project) throw new Error("Research project not found");
      const owned = input.sourceIds.length ? await db.select({ id: researchSources.id }).from(researchSources)
        .where(and(eq(researchSources.projectId, project.id), inArray(researchSources.id, input.sourceIds))) : [];
      if (owned.length !== input.sourceIds.length) throw new Error("A finding may cite only sources inside its project.");
      await db.insert(researchFindings).values({ workspaceId, projectId: project.id, text: input.text, sourceIds: input.sourceIds });
      await db.update(researchProjects).set({ updatedAt: new Date() }).where(eq(researchProjects.id, project.id));
      await audit(workspaceId, project.agentId, "research.finding.saved", `${project.name}: ${input.text.slice(0, 120)}`);
    } else if (action === "deleteResearchFinding") {
      const findingId = uuid.parse(body.findingId);
      const [finding] = await db.select().from(researchFindings).where(and(eq(researchFindings.id, findingId), eq(researchFindings.workspaceId, workspaceId))).limit(1);
      if (!finding) throw new Error("Finding not found");
      await db.delete(researchFindings).where(eq(researchFindings.id, finding.id));
      await audit(workspaceId, null, "research.finding.deleted", finding.text.slice(0, 120));
    } else if (action === "createTeam") {'''
assert marker in s
s = s.replace(marker, actions, 1)

io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("research wired")
