/**
 * The organisation: agents that own work, and agents that report to them.
 *
 * A team is a flat list of people you can ask. An org is a structure: someone is accountable,
 * someone else does the work, and the answer comes back up. This file owns the shape of that
 * structure — validation, the tree the sidebar draws, and who may reach whom. The reporting rule
 * is deliberately strict, because a graph an agent authored is not trustworthy by default.
 */

export type OrgMember = { name: string; role: string; instructions: string; reportsTo: string | null };
export type Org = { team: string; brief: string; members: OrgMember[] };
export type OrgNode = { name: string; role?: string; instructions?: string; reportsTo: string | null; children: OrgNode[]; descendants: number };
type Linkable = { id: string; managerId: string | null };

/** Ten seats is a company; more than this is a model inventing an HR department. */
export const MAX_MEMBERS = 12;

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Coerce a model-authored org into something safe.
 *
 * A `reportsTo` may only name a member listed ABOVE it. That one rule makes a cycle impossible
 * by construction — no visited-set dance — and reads exactly like an org chart drawn top-down.
 * Anything else (a name that does not exist, a self-reference, a forward reference) becomes a root.
 */
export function normaliseOrg(raw: unknown): Org | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const source = Array.isArray(o.members) ? o.members : Array.isArray(o.agents) ? o.agents : [];
  const team = str(o.team, 60) || str(o.name, 60) || "New organisation";
  const brief = str(o.brief, 400);
  const taken = new Set<string>();
  const members: OrgMember[] = [];

  for (const entry of source.slice(0, MAX_MEMBERS)) {
    const e = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    let name = str(e.name, 40);
    const role = str(e.role, 80);
    if (!name || !role) continue;
    if (taken.has(name.toLowerCase())) {
      let attempt = 2;
      while (taken.has(`${name.toLowerCase()}-${attempt}`)) attempt++;
      if (attempt > 9) continue;
      name = `${name}-${attempt}`;
    }
    taken.add(name.toLowerCase());
    const reportsToRaw = str(e.reportsTo, 40) || str(e.reports_to, 40) || str(e.manager, 40);
    const reportsTo = members.find(x => x.name.toLowerCase() === reportsToRaw.toLowerCase())?.name ?? null;
    members.push({
      name,
      role,
      instructions: str(e.instructions, 4000) || `${name} works as ${role}. Report the outcome, not the effort.`,
      reportsTo,
    });
  }

  return members.length ? { team, brief, members } : null;
}

/** Depth-first tree, roots first. `descendants` counts the whole subtree, not just children. */
export function orgTree<T extends { name: string; reportsTo: string | null }>(members: T[]): OrgNode[] {
  const nodes = new Map<string, OrgNode>();
  for (const m of members) nodes.set(m.name, { ...m, children: [], descendants: 0 });
  const roots: OrgNode[] = [];
  for (const m of members) {
    const node = nodes.get(m.name)!;
    const parent = m.reportsTo ? nodes.get(m.reportsTo) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  const count = (n: OrgNode): number => {
    n.descendants = n.children.reduce((sum, c) => sum + 1 + count(c), 0);
    return n.descendants;
  };
  roots.forEach(count);
  return roots;
}

export function reportsOf<T extends Linkable>(rows: T[], id: string): T[] {
  return rows.filter(r => r.managerId === id && r.id !== id);
}

export function managerOf<T extends Linkable>(rows: T[], id: string): T | null {
  const self = rows.find(r => r.id === id);
  return self?.managerId ? rows.find(r => r.id === self.managerId && r.id !== id) ?? null : null;
}

/**
 * Who one agent may reach through the structure: their manager, their direct reports, and the
 * people who share their manager. Not the whole workspace — an agent that could ask anyone would
 * make the reporting line decorative.
 */
export function reachableFor<T extends Linkable>(rows: T[], id: string): T[] {
  const self = rows.find(r => r.id === id);
  if (!self) return [];
  const manager = self.managerId ? rows.find(r => r.id === self.managerId) : undefined;
  const reports = rows.filter(r => r.managerId === self.id && r.id !== self.id);
  const siblings = manager ? rows.filter(r => r.managerId === manager.id && r.id !== self.id) : [];
  const seen = new Map<string, T>();
  for (const row of [manager, ...reports, ...siblings]) if (row && !seen.has(row.id)) seen.set(row.id, row);
  return [...seen.values()];
}

/** The company the product asks for most: strategy, the product line, the build line, quality, data, customers. */
export function orgTemplate(team: string, brief: string): Org {
  const seat = (name: string, role: string, reportsTo: string | null, instructions: string): OrgMember => ({ name, role, reportsTo, instructions });
  return {
    team: str(team, 60) || "Nexus Labs",
    brief: str(brief, 400),
    members: [
      seat("Chief Executive", "Strategy and final calls", null, "You set direction and make the call when the team is split. Answer with a decision and the reason, and name which seat owns executing it."),
      seat("Product Owner", "Backlog, priorities, stakeholders", "Chief Executive", "You own what gets built and in what order. Keep the backlog short, say what is explicitly not happening, and hand work to the seats below you with an acceptance outcome attached."),
      seat("Chief Technology", "Architecture and technical risk", "Chief Executive", "You own the architecture and the technical risk register. Give constraints, estimates, and the trade-off you would take — never a list of options without a recommendation."),
      seat("Project Manager", "Sprints, timeline, risk tracking", "Product Owner", "You turn decisions into a plan with dates and owners. Flag the item most likely to slip before anything else."),
      seat("UX Researcher", "Interviews, personas, synthesis", "Product Owner", "You represent the user. Report what people actually did and said, separated from what they claimed they would do."),
      seat("Designer", "Wireframes, UI decisions, rationale", "Product Owner", "You design the interface and defend it with reasons tied to the user's task, not taste."),
      seat("Developer", "Implementation and estimates", "Chief Technology", "You build it and estimate honestly, stating what you would cut first if the date is fixed."),
      seat("QA", "Test strategy and acceptance", "Chief Technology", "You decide what 'done' means and try to break it. Report failures with the exact steps to reproduce."),
      seat("Data Analyst", "Metrics, KPIs, performance", "Chief Executive", "You measure whether the decision worked. State the number, its source, and what it cannot tell you."),
      seat("Customer Success", "Feedback, pain points, requests", "Product Owner", "You carry the customers' voice. Bring the pain point with its frequency and its revenue weight, not as an anecdote."),
    ],
  };
}

/** Existing agents keep their names; a proposed seat that clashes is suffixed, and the lines
 * pointing at it follow the new name so the chart cannot be broken by the rename. */
export function decollideOrg(org: Org, taken: string[]): Org {
  const used = new Set(taken.map(n => n.toLowerCase()));
  const renamed = new Map<string, string>();
  const members: OrgMember[] = [];
  for (const m of org.members) {
    let name = m.name;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${m.name}-${n}`;
    used.add(name.toLowerCase());
    renamed.set(m.name.toLowerCase(), name);
    members.push({ ...m, name });
  }
  return { ...org, members: members.map(m => ({ ...m, reportsTo: m.reportsTo ? renamed.get(m.reportsTo.toLowerCase()) ?? m.reportsTo : null })) };
}
