/**
 * Inserts the sample content in seed/fixtures.json into an existing workspace.
 *
 * The app never imports this file. A first visit gives you an empty workspace, and that is the
 * product's real behaviour; this script exists so a demo, a screenshot session or a walkthrough
 * can be populated deliberately rather than silently.
 *
 *   DATABASE_URL=... node seed/seed-demo.ts                 # newest workspace
 *   DATABASE_URL=... node seed/seed-demo.ts --workspace <id>
 *   DATABASE_URL=... node seed/seed-demo.ts --new           # create a workspace and fill it
 *   DATABASE_URL=... node seed/seed-demo.ts --list
 *
 * Refuses to run against a workspace that already has agents unless --force is given, because
 * double-seating a workspace produces duplicate names and a run history nobody recognises.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { agents, approvals, events, messages, routines, runSteps, runs, workspaces } from "../src/db/schema.ts";

const fixtures = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures.json", import.meta.url)), "utf8"));

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return null;
  return args[i + 1] ?? true;
};
const has = (name: string) => args.includes(`--${name}`);

async function pickWorkspace(): Promise<{ id: string; name: string; timezone: string } | null> {
  const requested = flag("workspace");
  if (typeof requested === "string") {
    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, requested)).limit(1);
    if (!row) throw new Error(`No workspace with id ${requested}`);
    return row;
  }
  if (has("new")) {
    const [row] = await db.insert(workspaces).values({ name: fixtures.workspaceName }).returning();
    console.log(`created workspace ${row.id}`);
    return row;
  }
  const [row] = await db.select().from(workspaces).orderBy(desc(workspaces.createdAt)).limit(1);
  return row ?? null;
}

async function main() {
  if (has("list")) {
    const rows = await db.select({ id: workspaces.id, name: workspaces.name, createdAt: workspaces.createdAt }).from(workspaces).orderBy(desc(workspaces.createdAt)).limit(25);
    for (const r of rows) console.log(`${r.id}  ${r.createdAt?.toISOString?.() ?? ""}  ${r.name}`);
    return;
  }

  const workspace = await pickWorkspace();
  if (!workspace) throw new Error("No workspaces exist. Open the app once, or pass --new.");

  const existing = await db.select({ id: agents.id }).from(agents).where(eq(agents.workspaceId, workspace.id)).limit(1);
  if (existing.length && !has("force")) {
    throw new Error(`Workspace ${workspace.id} already has agents. Pass --force to add the sample set anyway, or --new for a clean one.`);
  }

  const inserted = await db.insert(agents).values(
    fixtures.agents.map((a: Record<string, string>) => ({
      workspaceId: workspace.id, name: a.name, role: a.role, instructions: a.instructions, avatar: a.avatar, color: a.color,
    })),
  ).returning();
  const byKey = new Map<string, string>(inserted.map((row, i) => [fixtures.agents[i].key, row.id] as [string, string]));
  /** A fixture that names an unknown key is a broken file, not a row with a null agent. */
  const seat = (key: unknown) => {
    const id = typeof key === "string" ? byKey.get(key) : undefined;
    if (!id) throw new Error(`fixtures.json references an unknown agent key: ${String(key)}`);
    return id;
  };
  const routineIdFor = (name: unknown) => {
    const id = typeof name === "string" ? routineByName.get(name) : undefined;
    if (!id) throw new Error(`fixtures.json references an unknown routine: ${String(name)}`);
    return id;
  };

  await db.insert(messages).values(fixtures.greetings.map((g: Record<string, string>) => ({
    workspaceId: workspace.id, agentId: seat(g.agent), role: "assistant", content: g.content,
  })));

  // Sample routines are switched off: since the always-on worker shipped, a seeded routine left
  // enabled would genuinely fire at its scheduled time and spend the workspace's model budget on
  // content the board labels "sample". A human flips it on when they want the work to be real.
  const seededRoutines = await db.insert(routines).values(fixtures.routines.map((r: Record<string, string>) => ({
    workspaceId: workspace.id, agentId: seat(r.agent), name: r.name, description: r.description,
    schedule: r.schedule, timezone: workspace.timezone, icon: r.icon, enabled: false,
  }))).returning();
  const routineByName = new Map<string, string>(seededRoutines.map(r => [r.name, r.id]));

  for (const r of fixtures.runs) {
    const started = new Date(Date.now() - r.hoursAgo * 3_600_000);
    const [run] = await db.insert(runs).values({
      workspaceId: workspace.id, agentId: seat(r.agent), routineId: routineIdFor(r.routine),
      title: r.title, status: "COMPLETED", summary: r.summary, startedAt: started,
      initiator: "routine",
      completedAt: new Date(started.getTime() + r.durationSeconds * 1000),
    }).returning();
    await db.insert(runSteps).values(fixtures.runSteps.map((s: Record<string, string>) => ({
      workspaceId: workspace.id, runId: run.id, title: s.title, detail: s.detail === "$summary" ? r.summary : s.detail,
    })));
  }

  await db.insert(approvals).values({
    workspaceId: workspace.id, agentId: seat(fixtures.approval.agent), title: fixtures.approval.title,
    detail: fixtures.approval.detail, risk: fixtures.approval.risk,
  });

  const [fresh] = await db.select().from(workspaces).where(eq(workspaces.id, workspace.id)).limit(1);
  if (!fresh.creatorAgentId) {
    await db.update(workspaces).set({ creatorAgentId: seat(fixtures.creator) }).where(eq(workspaces.id, workspace.id));
  }

  await db.insert(events).values({ workspaceId: workspace.id, agentId: null, type: "workspace.seeded", detail: `Sample content inserted by seed/seed-demo.ts (${fixtures.agents.length} agents)` });

  console.log(`Seeded workspace ${workspace.id} "${workspace.name}": ${fixtures.agents.length} agents, ${fixtures.routines.length} routines, ${fixtures.runs.length} sample runs.`);
  console.log("Point the app at it by setting the arova_workspace cookie to that id.");
}

main().catch(err => { console.error(err.message ?? err); process.exitCode = 1; });
