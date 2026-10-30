import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentVersions } from "@/db/schema";
import { needsVersion, nextVersion, type AgentSnapshot } from "@/lib/versions";

export type VersionedAgent = { id: string; workspaceId: string; instructions: string; provider: string; capabilities: Record<string, unknown> | null };

const snapshotOf = (agent: VersionedAgent): AgentSnapshot => ({
  instructions: agent.instructions,
  provider: agent.provider,
  capabilities: agent.capabilities,
});

async function latestRow(agentId: string) {
  const [row] = await db.select().from(agentVersions).where(eq(agentVersions.agentId, agentId)).orderBy(desc(agentVersions.version)).limit(1);
  return row ?? null;
}

/**
 * Pin the seat's current instructions. Calling this at every run start also covers seats created by
 * a team or org build, which do not pass through the single-agent editor. A concurrent publish
 * loses the unique race; the retry compares again and reuses the winner if it matches.
 */
export async function ensureAgentVersion(agent: VersionedAgent): Promise<string> {
  const current = snapshotOf(agent);
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await latestRow(agent.id);
    if (latest && !needsVersion({ instructions: latest.instructions, provider: latest.provider, capabilities: latest.capabilities }, current)) return latest.id;
    try {
      const [row] = await db.insert(agentVersions).values({
        workspaceId: agent.workspaceId,
        agentId: agent.id,
        version: nextVersion(latest?.version ?? 0),
        instructions: agent.instructions,
        capabilities: agent.capabilities,
        provider: agent.provider,
      }).returning({ id: agentVersions.id });
      return row.id;
    } catch (error) {
      // A concurrent publish won the (agent_id, version) race; re-read and either reuse or retry.
      if (attempt === 2) throw error;
    }
  }
  throw new Error("Could not pin this seat's instructions.");
}
