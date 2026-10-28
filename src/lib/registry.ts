/**
 * The agent registry: one row per seat, assembled from rows the server already stores.
 *
 * This is a read model, not a new source of truth. It answers the governance question a buyer
 * actually asks — who exists, who owns them, what can they do, what did they last do, and what is
 * waiting on a human — without inventing a score or a health colour that the data does not support.
 *
 * Counts arrive as exact aggregates from SQL, not from the board's 60-row window, because a
 * registry that undercounts is worse than no registry.
 */

export type RegistryAgent = {
  id: string;
  name: string;
  role: string;
  status: string;
  teamId: string | null;
  managerId: string | null;
  provider: string;
  capabilities: unknown;
};

export type RegistryStats = {
  lastRunAt: Date | string | null;
  lastRunStatus: string | null;
  runCount: number;
  pendingApprovals: number;
  routineCount: number;
};

export type RegistryRow = {
  id: string;
  name: string;
  role: string;
  status: string;
  teamName: string | null;
  managerName: string | null;
  provider: string;
  tools: number;
  permissionMode: string;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  runCount: number;
  pendingApprovals: number;
  routineCount: number;
};

const EMPTY: RegistryStats = { lastRunAt: null, lastRunStatus: null, runCount: 0, pendingApprovals: 0, routineCount: 0 };
const asIso = (value: Date | string) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());
const capsOf = (raw: unknown): { tools?: unknown; permissionMode?: unknown } => (raw && typeof raw === "object" ? raw as { tools?: unknown; permissionMode?: unknown } : {});

export function buildRegistry(
  agents: RegistryAgent[],
  teams: { id: string; name: string }[],
  stats: Map<string, RegistryStats>,
): RegistryRow[] {
  const teamName = new Map(teams.map(t => [t.id, t.name]));
  const nameById = new Map(agents.map(a => [a.id, a.name]));
  return agents.map(agent => {
    const mine = stats.get(agent.id) ?? EMPTY;
    const caps = capsOf(agent.capabilities);
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      status: agent.status,
      teamName: agent.teamId ? teamName.get(agent.teamId) ?? null : null,
      managerName: agent.managerId ? nameById.get(agent.managerId) ?? null : null,
      provider: agent.provider,
      tools: Array.isArray(caps.tools) ? caps.tools.length : 0,
      permissionMode: typeof caps.permissionMode === "string" ? caps.permissionMode : "default",
      lastRunAt: mine.lastRunAt ? asIso(mine.lastRunAt) : null,
      lastRunStatus: mine.lastRunStatus,
      runCount: mine.runCount,
      pendingApprovals: mine.pendingApprovals,
      routineCount: mine.routineCount,
    };
  }).sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === "ACTIVE" ? -1 : 1));
}

/** Free-text filter over the fields a person would type: name, role, team, status, provider. */
export function searchRegistry(rows: RegistryRow[], query: string): RegistryRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(r => [r.name, r.role, r.teamName ?? "", r.status, r.provider].some(v => v.toLowerCase().includes(q)));
}
