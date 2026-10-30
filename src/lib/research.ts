/**
 * Research is deterministic without a model: collect sources through the fetch policy, number them
 * stably, and write findings that cite those numbers. Pure helpers so the brief can be tested.
 */

export type ResearchProjectLike = { name: string; question: string; status: string };
export type ResearchSourceLike = { id: string; url: string; host: string; title: string; excerpt: string; note: string; tag: string; pinned: boolean };
export type ResearchFindingLike = { text: string; sourceIds: string[] };

/** A fragment is not the page. Strip it; keep the query, which can change the document. */
export function normaliseSourceUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function sourceHost(url: string): string {
  try { return new URL(url).host; } catch { return ""; }
}

export function clampExcerpt(text: string, limit = 4000): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit)} … truncated at ${limit} characters of ${clean.length}`;
}

/** Sources first, then findings; a finding cites the number the brief printed for its source. */
export function researchBrief(project: ResearchProjectLike, sources: readonly ResearchSourceLike[], findings: readonly ResearchFindingLike[]): string {
  const ordered = [...sources].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const number = new Map(ordered.map((source, index) => [source.id, index + 1]));
  const lines: string[] = [`# ${project.name}`];
  if (project.question.trim()) lines.push("", project.question.trim());
  lines.push("", `Status: ${project.status.toLowerCase()} · ${ordered.length} source(s) · ${findings.length} finding(s)`);
  lines.push("", "## Findings");
  if (!findings.length) lines.push("No findings recorded.");
  for (const finding of findings) {
    const cites = finding.sourceIds.map(id => number.get(id)).filter((n): n is number => Boolean(n));
    lines.push("", `- ${finding.text.trim()}${cites.length ? ` [${cites.join(", ")}]` : " (no source cited)"}`);
  }
  lines.push("", "## Sources");
  if (!ordered.length) lines.push("No sources yet.");
  ordered.forEach((source, index) => {
    const label = source.title || source.host || source.url || "Untitled source";
    lines.push("", `${index + 1}. ${label}${source.url ? ` — ${source.url}` : ""}${source.tag ? ` · ${source.tag}` : ""}`);
    if (source.note.trim()) lines.push(`   ${source.note.trim()}`);
    if (source.excerpt.trim()) lines.push(`   ${source.excerpt.trim().slice(0, 600)}`);
  });
  return `${lines.join("\n")}\n`;
}
