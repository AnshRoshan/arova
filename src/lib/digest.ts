/**
 * Spec 44 — the proactive digest's pure core. The worker queries stored facts and hands them here;
 * what comes back is the brief a person reads first thing. Nothing here calls a model: a digest
 * that needs a key to say "three watches are failing" would never ship, and the facts are stored
 * rows anyway. Sections are additive — later specs append their own without touching this shape.
 */

export type DigestFacts = {
  /** Open attention items, most severe first (as the caller ordered them). */
  attention: { title: string; severity: string; body: string }[];
  /** Watches the failure ladder paused, and goals switched off. */
  paused: { kind: "watch" | "goal" | "routine"; title: string; why: string }[];
  /** Jobs that dead-lettered since the last digest (FAILED terminal, not RETRYING). */
  deadLettered: { kind: string; lastError: string | null }[];
  /** Queue health at build time. */
  queue: { workerLive: boolean; pending: number };
  /** What the last digest already said, so an unchanged day is not re-announced. */
  sinceLabel: string | null;
};

/** One digest section: a heading, the rows that earned it, and the honest empty line. */
export type DigestSection = { heading: string; lines: string[]; empty: string };

export function digestSections(facts: DigestFacts): DigestSection[] {
  const urgent = facts.attention.filter(a => a.severity === "urgent");
  const attention = facts.attention.filter(a => a.severity !== "urgent");
  const sections: DigestSection[] = [];
  if (urgent.length) sections.push({ heading: "Needs you now", lines: urgent.map(a => `${a.title} — ${a.body.slice(0, 160)}`), empty: "" });
  if (attention.length) sections.push({ heading: "Attention", lines: attention.slice(0, 5).map(a => `${a.title} — ${a.body.slice(0, 160)}`), empty: "" });
  if (facts.paused.length) sections.push({ heading: "Paused by the ladder", lines: facts.paused.map(p => `${p.title} (${p.kind}) — ${p.why}`), empty: "" });
  if (facts.deadLettered.length) sections.push({ heading: "Dead-lettered jobs", lines: facts.deadLettered.slice(0, 5).map(j => `${j.kind} — ${j.lastError ?? "no error recorded"}`), empty: "" });
  sections.push({
    heading: "Queue",
    lines: [facts.queue.workerLive ? `A worker is live; ${facts.queue.pending} job(s) waiting.` : `No live worker — ${facts.queue.pending} queued job(s) will wait, and the board says so.`],
    empty: "",
  });
  return sections;
}

const NL = String.fromCharCode(10);

/** The rendered digest. Nothing stored means the quiet day is stated, never skipped silently. */
export function renderDigest(workspaceName: string, facts: DigestFacts, now: Date): string {
  const sections = digestSections(facts);
  const when = facts.sinceLabel ? ` since ${facts.sinceLabel}` : "";
  // The queue section is always present; "quiet" means nothing else earned a line.
  const factsSections = sections.slice(0, -1);
  const queueLine = sections[sections.length - 1].lines[0];
  const body = factsSections.length
    ? [...factsSections.flatMap(s => [`${s.heading}:`, ...s.lines]), queueLine].join(NL)
    : ["Everything the ladder watches is quiet.", queueLine].join(NL);
  return [`Arova digest · ${workspaceName} · ${now.toISOString().slice(0, 10)}${when}`, body].join(NL);
}
