/**
 * The org channel: the decisions the server may make without a model in the loop.
 *
 * A brief to an organisation's lead produces channel posts — rows addressed to the org rather than
 * to one seat — and the summons between seats are what those posts document. Everything here is
 * pure so the honest parts (who was asked, who never was, who is allowed to found a company) can be
 * tested without a database or an endpoint.
 */

export type Subject = { teamId: string | null; agentId: string | null };

/**
 * A name the human typed, whether or not they quoted it.
 *
 * The bug this replaces (L-11) read only a quoted name, so "create the org with name hex-aq" fell
 * through to the reviewed template and the company was created as "Nexus Labs".
 */
export function requestedOrgName(prompt: string): string | null {
  const quoted = /["“']([^"”']{2,40})["”']/.exec(prompt)?.[1];
  if (quoted) return clean(quoted);
  // "with name X", "called X", "named X", "name it X" — an optional colon separates the value
  const spoken = /\b(?:with\s+(?:the\s+)?name|name\s+it|called|named|name)\s*:?\s*[“"']?([A-Za-z0-9][\w'-]{1,39})/i.exec(prompt);
  return clean(spoken?.[1] ?? null);
}

const STOP_WORDS = new Set(["the", "a", "an", "it", "this", "that", "and", "for", "with", "group", "team", "org", "organisation", "organization", "company", "please", "you", "your"]);

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim().replace(/[.,;:!?]+$/, "");
  if (trimmed.length < 2 || trimmed.length > 40) return null;
  if (STOP_WORDS.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

/** A post belongs to an org or to one seat. Both would double-count it; neither would attribute it. */
export function channelSubject(subject: Subject): Subject {
  if (!subject.teamId && !subject.agentId) throw new Error("A post needs one of team or seat to belong to.");
  if (subject.teamId && subject.agentId) throw new Error("A post is addressed to the org or to one seat, not both.");
  return { teamId: subject.teamId ?? null, agentId: subject.agentId ?? null };
}

/**
 * Org isolation (D-15.3). Deliberately narrower than what worked before: reporting lines no longer
 * open a door into someone else's company, because per-org memory cannot be promised while it can.
 */
export function hermeticPeers<T extends { id: string; teamId: string | null }>(seats: T[], actorTeamId: string | null, actorId: string): T[] {
  if (!actorTeamId) return [];
  return seats.filter(s => s.id !== actorId && s.teamId === actorTeamId);
}

/**
 * Who receives the brief: the seat the org was given a lead for, otherwise the root of the
 * reporting chart, otherwise the first seat. An org with no seats has nobody to brief, and the
 * caller must say so rather than inventing a recipient.
 */
export function resolveLead<T extends { id: string; managerId: string | null }>(seats: T[], leadAgentId: string | null): T | null {
  if (!seats.length) return null;
  const designated = leadAgentId ? seats.find(s => s.id === leadAgentId) : undefined;
  if (designated) return designated;
  return seats.find(s => !s.managerId) ?? seats[0];
}

export type Actor = { id: string; name: string; teamId: string | null; isCreator?: boolean; isLead?: boolean };
export type Verdict = { ok: true } | { ok: false; why: string };

/** Founding a company is the one act a seat may not take unless it was designated for it (D-15.4). */
export function mayFoundOrg(actor: Actor, creator?: { name: string } | null): Verdict {
  if (actor.isCreator) return { ok: true };
  const who = creator?.name ? `${creator.name}, this workspace's creator seat` : "the designated creator seat";
  return {
    ok: false,
    why: `${actor.name} is not this workspace's creator seat, so it cannot found an organisation. Only ${who} may — the rest of the bench can ask it, or you can create the organisation yourself from Organisation.`,
  };
}

/** A lead may staff inside its own org; nobody may staff into someone else's. */
export function mayStaffOrg(actor: Actor, targetTeamId: string): Verdict {
  if (actor.isCreator) return { ok: true };
  if (!actor.isLead) {
    return { ok: false, why: `${actor.name} is not the lead of this organisation, so it cannot add seats to it. Ask ${actor.teamId === targetTeamId ? "the org's lead" : "your lead"} — only a lead staffs its own bench.` };
  }
  if (actor.teamId !== targetTeamId) {
    return { ok: false, why: `${actor.name} leads its own organisation and cannot staff into another one. Seats are added inside the org they belong to.` };
  }
  return { ok: true };
}

const budgetPhrase = (calls: number, limit: number) => (limit > 0 ? `${calls} of ${limit} model calls allowed today` : "the model-call budget for today");

/**
 * The row a brief must leave behind when the daily budget cuts it short.
 *
 * Silence here is the worst failure the channel can have: an unfinished coordination would read as
 * a team that finished. So the row names who was answered and who was never asked at all.
 */
export function budgetStopRow(facts: { asked: string[]; unasked: string[]; calls: number; limit: number }): { kind: string; content: string; metadata: Record<string, unknown> } | null {
  if (!facts.unasked.length) return null;
  const parts = [
    `Stopped at the daily budget (${budgetPhrase(facts.calls, facts.limit)}).`,
    facts.asked.length ? `${facts.asked.join(", ")} ${facts.asked.length === 1 ? "was" : "were"} asked and answered.` : "No teammate was reached before it ran out.",
    `${facts.unasked.join(", ")} ${facts.unasked.length === 1 ? "was" : "were"} never asked, so nothing was done on their side.`,
    "Raise DAILY_MODEL_CALLS_LIMIT on the server, or brief a smaller piece of this.",
  ];
  return { kind: "budget_stop", content: parts.join(" "), metadata: { asked: facts.asked, unasked: facts.unasked, calls: facts.calls, limit: facts.limit } };
}

/**
 * The other way a brief can run out: every summon it chose did answer, and the budget died on the
 * way to the report. Naming the seats that were skipped would be a lie here — nobody meant to ask
 * them — so this row credits the posts that exist and says plainly that nothing has been weighed.
 */
export function noReportStopRow(facts: { author: string; posted: string[]; calls: number; limit: number }): { kind: string; content: string; metadata: Record<string, unknown> } {
  const posted = facts.posted.filter(Boolean);
  const middle = posted.length
    ? `${posted.join(" and ")} posted ${posted.length === 1 ? "an answer" : "answers"} here, but ${facts.author} had no call left to write the report — nothing has been weighed together yet.`
    : `${facts.author} had no call left before any teammate was asked, so nothing was consulted and no report was written.`;
  return {
    kind: "budget_stop",
    content: `Stopped at the daily budget (${budgetPhrase(facts.calls, facts.limit)}). ${middle} Raise DAILY_MODEL_CALLS_LIMIT on the server, or brief a smaller piece of this.`,
    metadata: { posted, asked: posted, unasked: [], calls: facts.calls, limit: facts.limit },
  };
}

/**
 * How many teammates one turn may pull in.
 *
 * `maxTurns` is a control the capabilities UI already exposes, so the server has to honour it or the
 * slider lies: a seat given one turn answers alone, and the server's own ceiling still wins above it.
 */
export function summonCeiling(facts: { envMax: number; seatMaxTurns: number | null }): number {
  const env = Math.max(0, Math.trunc(facts.envMax));
  if (!facts.seatMaxTurns) return env;
  return Math.min(env, Math.max(0, Math.trunc(facts.seatMaxTurns) - 1));
}

export type ApprovalOutcome = "APPROVED" | "REJECTED";

/**
 * When a seat should stop asking.
 *
 * A human who has refused three proposals in a row has answered the question; raising a fourth is the
 * agent spending their attention on purpose. The window catches the slower pattern — a seat whose work
 * is broadly not wanted — without punishing one bad day, and it counts only what the human actually
 * decided, so an unanswered request never trips it.
 */
export function denialBreaker(history: ApprovalOutcome[], limits = { consecutive: 3, window: 50, windowDenials: 10 }): { tripped: boolean; consecutive: number; denials: number; considered: number; reason: string | null } {
  const recent = history.slice(0, limits.window);
  let consecutive = 0;
  for (const row of recent) { if (row === "REJECTED") consecutive++; else break; }
  const denials = recent.filter(r => r === "REJECTED").length;
  const tripped = consecutive >= limits.consecutive || denials >= limits.windowDenials;
  const reason = consecutive >= limits.consecutive
    ? `the last three were refused in a row`
    : denials >= limits.windowDenials ? `${denials} of the last ${recent.length} were refused` : null;
  return { tripped, consecutive, denials, considered: recent.length, reason };
}

/** The synthesis post attributes itself to its author and names only the peers that actually replied. */
export function summarisePost(facts: { author: string; used: string[]; note?: string }): { kind: string; content: string; metadata: Record<string, unknown> } {
  const used = facts.used.filter(Boolean);
  const content = used.length
    ? `${facts.author} reports: built on ${used.length} teammate ${used.length === 1 ? "post" : "posts"} — ${used.join(", ")}.${facts.note ? ` ${facts.note}` : ""}`
    : `${facts.author} reports: completed without a teammate.${facts.note ? ` ${facts.note}` : ""}`;
  return { kind: "channel_summary", content, metadata: { authoredByName: facts.author, usedPeers: used } };
}
