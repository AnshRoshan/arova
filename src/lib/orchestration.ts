/**
 * Orchestration: the pure decision logic for teams and single-hop delegation.
 *
 * Pure and side-effect-free on purpose — the board route owns the calls and the writes, so
 * every rule here is unit-testable without a database or a model key. It imports org.ts for
 * the seat shape, which is pure for the same reason.
 *
 * Delegation is expressed as a JSON directive in the model's own reply rather than native
 * tool calling, because "any OpenAI-compatible endpoint" includes servers whose tool-calling
 * support we cannot assume. A directive degrades to a plain answer on any endpoint.
 */

import { normaliseOrg } from "./org.ts";

export type Consult = { agent: string; question: string };
export type Turn = { consult: Consult | null; text: string };
export type RosterAgent = { name: string; role: string; instructions: string };
/** A roster with reporting lines: the difference between a team and an organisation. */
export type OrgProposal = { team: string; brief: string; agents: (RosterAgent & { reportsTo: string | null })[] };
export type Roster = { team: string; agents: RosterAgent[] };
export type Peer = { id: string; name: string; role?: string };

/** A family bigger than this is a cost trap, not an organisation chart. */
export const MAX_ROSTER = 4;

const clean = (text: string) =>
  text
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/[ \t]+$/gm, "")
    .trim()
    .replace(/\n{3,}/g, "\n\n");

/** Locate a balanced `{"consult": …}` object, tolerating prose and fences around it. */
function locateDirective(text: string): { json: string; start: number; end: number } | null {
  const opener = /\{\s*"consult"\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(text))) {
    const start = match.index;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (escaped) { escaped = false; continue; }
      if (c === "\\") { escaped = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return { json: text.slice(start, i + 1), start, end: i + 1 };
      }
    }
    opener.lastIndex = start + 1;
  }
  return null;
}

/** One model pass in, either an answer or a request to consult a peer out.
 * Anything unparseable is treated as prose: losing a user's reply to a malformed
 * directive would be a worse failure than not delegating.
 */
export function parseTurn(raw: string): Turn {
  const found = locateDirective(raw);
  if (!found) return { consult: null, text: clean(raw) };
  let parsed: unknown;
  try {
    parsed = JSON.parse(found.json);
  } catch {
    return { consult: null, text: clean(raw) };
  }
  const consult = (parsed as { consult?: { agent?: unknown; question?: unknown } })?.consult;
  const agent = typeof consult?.agent === "string" ? consult.agent.trim() : "";
  const question = typeof consult?.question === "string" ? consult.question.trim() : "";
  if (!agent || !question) return { consult: null, text: clean(raw) };
  return { consult: { agent, question }, text: clean(raw.slice(0, found.start) + raw.slice(found.end)) };
}

/** "create a product agency" / "build me a team of agents" — a verb plus a collective noun. */
const TEAM_INTENT = /\b(create|build|make|assemble|spin up|set up|design|form|recruit|hire)\b[\s\S]{0,40}\b(team|agency|squad|family|group of agents|crew|roster|collective|studio|department|workforce)\b/i;

export function isTeamIntent(prompt: string): boolean {
  return TEAM_INTENT.test(prompt);
}

/**
 * An organisation, not a team: the asker wants seats that report to each other. Checked before
 * the flat team intent, because "create a company with a product owner and engineers under them"
 * matches both, and the hierarchy is the part that would otherwise be thrown away.
 */
const ORG_INTENT = /\b(company|organisation|organization|org chart|org|hierarch|departments?|ceo|cto|chief executive|chief technology|report to|under them|product owner)\b/i;

export function isOrgIntent(prompt: string): boolean {
  return TEAM_INTENT.test(prompt) || ORG_INTENT.test(prompt);
}

export const ORG_SYSTEM = `You design an organisation of AI seats for a workspace. Reply with ONLY a JSON object, no prose, no markdown fences, shaped exactly like:
{"team":"<company name>","brief":"<what it exists to do>","members":[{"name":"<seat name>","role":"<what it owns>","instructions":"<how it should behave, as a duty>","reportsTo":"<name of a member listed above, or null>"}]}
List seats top-down: the owner of the org first. A seat may only report to a seat already listed above it, so the chart can never loop. Give 5 to 10 seats, each owning something the others do not, and give every seat a duty written as an instruction rather than a job title.`;

const FAMILIES: { match: RegExp; team: string; agents: RosterAgent[] }[] = [
  {
    match: /\b(product|roadmap|feature|prd|startup)\b/i, team: "Product Studio",
    agents: [
      { name: "Meridian", role: "Product lead", instructions: "Frames the problem, owns priorities and trade-offs, and writes the plan." },
      { name: "Scout", role: "Research analyst", instructions: "Finds evidence, compares alternatives and states what is still unknown." },
      { name: "Form", role: "Product designer", instructions: "Turns requirements into flows and interface decisions, with rationale." },
      { name: "Forge", role: "Engineering lead", instructions: "Judges feasibility, effort and technical risk; flags what would be expensive." },
    ],
  },
  {
    match: /\b(growth|marketing|campaign|acquisition|funnel|demand)\b/i, team: "Growth Desk",
    agents: [
      { name: "Beacon", role: "Growth strategist", instructions: "Picks the channel bet and the sequence, with a reason." },
      { name: "Quill", role: "Copywriter", instructions: "Writes the message for each channel and audience." },
      { name: "Tally", role: "Analytics", instructions: "Defines the metrics that prove or kill a bet." },
      { name: "Form", role: "Brand designer", instructions: "Shapes the visual and tone decisions." },
    ],
  },
  {
    match: /\b(research|study|report|diligence|analysis of the market)\b/i, team: "Research Unit",
    agents: [
      { name: "Scout", role: "Research analyst", instructions: "Gathers and cross-checks sources." },
      { name: "Tally", role: "Quantitative analyst", instructions: "Turns findings into numbers and comparisons." },
      { name: "Verity", role: "Fact-checker", instructions: "Challenges weak claims and names what cannot be verified." },
      { name: "Quill", role: "Report writer", instructions: "Writes the summary a decision-maker can act on." },
    ],
  },
  {
    match: /\b(content|editorial|blog|newsletter|video|podcast)\b/i, team: "Content Room",
    agents: [
      { name: "Quill", role: "Writer", instructions: "Drafts in the agreed voice." },
      { name: "Polish", role: "Editor", instructions: "Tightens structure and cuts what does not earn its place." },
      { name: "Form", role: "Designer", instructions: "Plans the visual treatment." },
      { name: "Beacon", role: "Distribution", instructions: "Decides where and when each piece goes out." },
    ],
  },
  {
    match: /\b(engineer|software|code|api|app build|platform)\b/i, team: "Engineering Pod",
    agents: [
      { name: "Forge", role: "Architect", instructions: "Chooses the shape of the system and defends the trade-off." },
      { name: "Bolt", role: "Backend engineer", instructions: "Data model, APIs and failure handling." },
      { name: "Weave", role: "Frontend engineer", instructions: "Interface behaviour and states." },
      { name: "Verity", role: "QA", instructions: "Names the cases that would break it." },
    ],
  },
  {
    match: /\b(launch|release|go-to-market|gtm)\b/i, team: "Launch Crew",
    agents: [
      { name: "Meridian", role: "Launch lead", instructions: "Owns the sequence, dates and go/no-go calls." },
      { name: "Scout", role: "Market researcher", instructions: "Validates the positioning claim." },
      { name: "Beacon", role: "Marketing", instructions: "Plans the announcement and channels." },
      { name: "Beacon", role: "Customer support", instructions: "Prepares answers for what will go wrong." },
    ],
  },
];

/**
 * A deterministic roster for when no model is configured, or the model returned junk.
 * Refuses to invent a team for an unrelated sentence — a proposal has to be about a team.
 */
export function fallbackRoster(prompt: string): Roster | null {
  if (!isTeamIntent(prompt)) return null;
  const family = FAMILIES.find(f => f.match.test(prompt));
  if (!family) return null;
  return { team: family.team, agents: family.agents.map(a => ({ ...a })) };
}

/** Turn whatever the model produced into a creatable roster, or nothing at all. */
export function normaliseRoster(raw: unknown): Roster | null {
  const source = Array.isArray(raw) ? { agents: raw } : (raw as { team?: unknown; agents?: unknown });
  if (!Array.isArray(source?.agents)) return null;
  const seen = new Set<string>();
  const agents: RosterAgent[] = [];
  for (const entry of source.agents) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name.trim().slice(0, 40) : "";
    const role = typeof e.role === "string" ? e.role.trim().slice(0, 80) : "";
    if (!name || !role) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    agents.push({ name, role, instructions: typeof e.instructions === "string" ? e.instructions.trim().slice(0, 2000) : "" });
    if (agents.length >= MAX_ROSTER) break;
  }
  // One agent cannot delegate to itself, so a "team" of one is not a team.
  if (agents.length < 2) return null;
  const team = typeof source.team === "string" && source.team.trim() ? source.team.trim().slice(0, 60) : "New team";
  return { team, agents };
}

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Match the name the model asked for against the roster. An agent consulting itself is
 * dropped here rather than by the caller, so no path can produce a self-loop.
 * Generic so the caller keeps its own richer roster row (role, instructions, provider).
 */
export function resolvePeer<T extends Peer>(requested: string, roster: T[], selfId: string): T | null {
  const want = norm(requested);
  if (!want) return null;
  const candidates = roster.filter(p => p.id !== selfId);
  return candidates.find(p => norm(p.name) === want)
    ?? candidates.find(p => norm(p.name).startsWith(want) || want.startsWith(norm(p.name)))
    ?? null;
}

export function canConsult(consultedIds: string[], maxHops: number): boolean {
  return maxHops > 0 && consultedIds.length < maxHops;
}

/** The peer is a specialist answering one question, not a chatbot continuing the thread. */
export function buildPeerPrompt(peer: RosterAgent & { name: string }, question: string, askerName: string): string {
  return [
    `You are ${peer.name}, ${peer.role}, in the Arova workspace. ${peer.instructions}`,
    `${askerName} is consulting you on one question as part of a larger answer.`,
    "Answer only that question from your own expertise, in 160 words or fewer. Do not greet, do not ask for context you could assume.",
    "You have no browser, filesystem, connected apps, or tool execution. Never claim to have looked anything up or performed an action. Say plainly when something cannot be verified.",
    `Question: ${question}`,
  ].join("\n");
}

/** Find the first balanced JSON object in a reply that may wrap it in prose or fences. */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) { escaped = false; continue; }
    if (c === "\\") { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

/** A roster from whatever the model wrote: bare JSON, fenced JSON, or prose around it. */
export function extractRoster(text: string): Roster | null {
  if (typeof text !== "string" || !text.trim()) return null;
  return normaliseRoster(JSON_SAFE(text)) ?? normaliseRoster(extractJsonObject(text));
}

function JSON_SAFE(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * Two teammates with one name make routing ambiguous, so a collision is renamed rather
 * than dropped — silently deleting agents is how a proposal stops matching what the user approved.
 */
export function decollide(roster: Roster, taken: string[]): Roster {
  const used = new Set(taken.map(t => t.trim().toLowerCase()));
  const agents = roster.agents.map(a => {
    let name = a.name;
    if (used.has(name.toLowerCase())) {
      let n = 2;
      while (used.has(`${name} ${n}`.toLowerCase())) n++;
      name = `${name} ${n}`;
    }
    used.add(name.toLowerCase());
    return { ...a, name };
  });
  return { ...roster, agents };
}

export type AgentAction = "none" | "consult" | "handoff" | "approval" | "build";
export type Routing = { action: AgentAction; agent?: string; question?: string; reason?: string; title?: string; detail?: string; org?: OrgProposal };

/**
 * The routing question asked before an answer is written. Only actions the agent is actually
 * granted are offered, so a capability the user removed cannot be exercised even if the model
 * improvises one - the option is simply not on the table.
 */
export function routingPrompt(question: string, roster: Peer[], allowed: { consult: boolean; handoff: boolean; approval: boolean; build: boolean }): string {
  const NL = String.fromCharCode(10);
  const options: string[] = ['{"consult":null} - answer it yourself (the usual case)'];
  if (allowed.consult && roster.length) options.push('{"consult":{"agent":"<teammate name>","question":"<the one thing you need from them>"}} - ask a teammate, you keep the floor and answer afterwards');
  if (allowed.handoff && roster.length) options.push('{"handoff":{"agent":"<teammate name>","reason":"<why it is their call>"}} - give the turn to a teammate, who answers the user directly');
  if (allowed.approval) options.push('{"approval":{"title":"<what needs approving>","detail":"<what would happen and to whom>"}} - stop and ask the user to approve something first');
  if (allowed.build) options.push('{"build":{"team":"<company or team name>","brief":"<what it exists to do>","members":[{"name":"<seat>","role":"<what it owns>","instructions":"<how it should behave>","reportsTo":"<an earlier member name or null>"}]}} - the asker asked for agents or an organisation to be created. List seats top-down: a seat may only report to a seat listed above it. 2-10 seats, each with a real duty.');
  const lines = roster.map(p => `- ${p.name}${p.role ? `: ${p.role}` : ""}`).join(NL);
  return [
    "Decide what the asker should do with this message. Reply with ONLY one JSON object, no prose, no reasoning, from exactly these shapes:",
    ...options,
    "Consult or hand off only when the teammate's judgement genuinely beats the asker's own; naming a teammate in the message means that request wins. Raising an approval is for something that would affect others or leave the workspace.",
    "",
    roster.length ? `Teammates:${NL}${lines}` : "Teammates: none.",
    "",
    `Message to judge: ${question.slice(0, 1200)}`,
  ].join(NL);
}

/** Read the router's decision. Anything unrecognisable means "no action", never a guess. */
export function parseRouting(text: string): Routing {
  const found = locateDirective(text)?.json ?? locateAnyObject(text);
  if (!found) return { action: "none" };
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(found) as Record<string, unknown>;
  } catch {
    return { action: "none" };
  }
  const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const rejectable = (v: string) => !v || PLACEHOLDER.test(v);
  if (parsed.handoff && typeof parsed.handoff === "object") {
    const o = parsed.handoff as Record<string, unknown>;
    const agent = clean(o.agent);
    if (rejectable(agent)) return { action: "none" };
    return { action: "handoff", agent, reason: clean(o.reason) || "the asker judged it their call" };
  }
  if (parsed.build && typeof parsed.build === "object") {
    const o = parsed.build as Record<string, unknown>;
    const org = normaliseOrg({ team: clean(o.team), brief: clean(o.brief), members: o.members });
    if (!org || org.members.length < 2) return { action: "none" };
    return { action: "build", org: { team: org.team, brief: org.brief, agents: org.members.map(mm => ({ name: mm.name, role: mm.role, instructions: mm.instructions, reportsTo: mm.reportsTo })) } };
  }
  if (parsed.approval && typeof parsed.approval === "object") {
    const o = parsed.approval as Record<string, unknown>;
    const title = clean(o.title);
    if (!title) return { action: "none" };
    return { action: "approval", title: title.slice(0, 120), detail: (clean(o.detail) || "No further detail was given.").slice(0, 600) };
  }
  if (parsed.consult && typeof parsed.consult === "object") {
    const o = parsed.consult as Record<string, unknown>;
    const agent = clean(o.agent), question = clean(o.question);
    if (rejectable(agent) || !question) return { action: "none" };
    return { action: "consult", agent, question };
  }
  return { action: "none" };
}

function locateAnyObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) { escaped = false; continue; }
    if (c === "\\") { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

const PLACEHOLDER = /<[a-z][^>]*>/i;

/**
 * Models sometimes echo the template from the routing prompt instead of filling it in.
 * A placeholder teammate is unusable, so it is dropped; a placeholder question is replaced
 * with what the user actually asked, which is the honest reading of the intent.
 */
export function cleanConsult(consult: Consult | null, askedByUser: string): Consult | null {
  if (!consult) return null;
  const agent = consult.agent.trim();
  if (!agent || PLACEHOLDER.test(agent)) return null;
  const question = consult.question.trim();
  return { agent, question: !question || PLACEHOLDER.test(question) ? askedByUser.trim() : question };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The deterministic half of routing: if the user names exactly one teammate, that is the route.
 * The model router is the other half, and a reasoning model can spend its whole output budget
 * thinking before it emits any JSON — a named teammate must not be lost to that.
 */
export function mentionConsult(question: string, roster: Peer[], selfId: string): Consult | null {
  const text = question.toLowerCase();
  if (!text.trim() || roster.length === 0) return null;
  const named = new Map<string, Peer>();
  for (const peer of roster) {
    if (peer.id === selfId) continue;
    if (new RegExp(String.raw`\b${escapeRegExp(peer.name.toLowerCase())}\b`).test(text)) named.set(peer.id, peer);
  }
  if (named.size !== 1) return null;
  const peer = [...named.values()][0];
  return { agent: peer.name, question: question.trim().slice(0, 1200) };
}
