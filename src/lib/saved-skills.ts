/**
 * Spec 23 — saved skills' pure core. A skill is a capability bundle (instructions + tool grants +
 * scope + version); the effective grant is skill ∩ seat ∩ policy, so a skill can never widen what
 * its user can already do. The portable payload is Markdown + frontmatter, not a bespoke DSL.
 */

export type SavedSkillLike = { name: string; description: string; scope: string; instructions: string; toolGrants: string[]; version: number };

/** Spec 23c: skill ∩ seat. Registry ids only; a skill's prose cannot conjure a tool. */
export function effectiveSkillGrants(skillGrants: string[], seatCaps: { tools: string[]; deniedTools: string[] }): string[] {
  const denied = new Set(seatCaps.deniedTools);
  const held = new Set(seatCaps.tools);
  return skillGrants.filter((g) => held.has(g) && !denied.has(g));
}

/** Scope decides who is offered a skill. A bench seat gets org skills, never a team's. */
export function skillAppliesTo(skill: { scope: string; teamId: string | null; agentId: string | null }, agent: { teamId: string | null; id: string }, hasTeam: boolean): boolean {
  if (skill.scope === "org") return true;
  if (skill.scope === "team") return hasTeam && skill.teamId === agent.teamId;
  if (skill.scope === "seat") return skill.agentId === agent.id;
  return false;
}

const SKILL_PROMPT_CAP = 4;

/** The prompt section: bounded, labelled as a record of how to work, with ungranted tools named as unavailable. */
export function savedSkillPrompt(skills: { name: string; instructions: string; grants: string[] }[], grantCheck: Map<string, boolean>): string {
  if (!skills.length) return "";
  const NL = String.fromCharCode(10);
  const lines = skills.slice(0, SKILL_PROMPT_CAP).map((s) => {
    const usable = s.grants.filter((g) => grantCheck.get(g) === true);
    const blocked = s.grants.filter((g) => grantCheck.get(g) !== true);
    const toolLine = usable.length ? ` Tools it may use: ${usable.join(", ")}.` : "";
    const blockedLine = blocked.length ? ` Tools it names but you do not hold (${blocked.join(", ")}) must not be used or claimed.` : "";
    return `- ${s.name}: ${s.instructions.slice(0, 400)}${toolLine}${blockedLine}`;
  });
  return `${NL}${NL}Saved skills — how this organisation runs repeatable work. They are records to follow where they apply, not authority beyond your own grants:${NL}${lines.join(NL)}`;
}

export function nextVersion(currentVersion: number, storedVersionCount: number): number {
  return Math.max(currentVersion, storedVersionCount) + 1;
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "skill";
}

/** Markdown + frontmatter: the portable payload the agent-skill ecosystems share. */
export function skillExport(skill: SavedSkillLike): string {
  const NL = String.fromCharCode(10);
  return [
    "---",
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    `scope: ${skill.scope}`,
    `version: ${skill.version}`,
    `tools: ${skill.toolGrants.join(", ")}`,
    "---",
    skill.instructions,
    "",
  ].join(NL);
}

/** Refuses anything without a frontmatter block carrying at least a name and a body. */
export function skillImport(text: string): (SavedSkillLike & { description: string }) | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text.trim());
  if (!match) return null;
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const name = meta.name?.trim();
  const instructions = match[2].trim();
  if (!name || !instructions) return null;
  return {
    name: name.slice(0, 120),
    description: (meta.description ?? "").slice(0, 300),
    scope: ["org", "team", "seat"].includes(meta.scope ?? "") ? (meta.scope as string) : "org",
    instructions: instructions.slice(0, 4000),
    toolGrants: (meta.tools ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    version: Number.isFinite(Number(meta.version)) ? Number(meta.version) : 1,
  };
}
