/**
 * The citation ledger: one numbering for every source the loop has seen.
 *
 * Before this, each web_search call numbered its own results from [1], and the UI re-numbered the
 * deduped source list from [1] again. A second search therefore made every citation point at a
 * different page than the one the model read. The ledger assigns each unique URL a number the first
 * time it is seen and keeps it for the whole loop, so the number in the answer, in the tool output
 * and in the source list are the same number.
 *
 * The report is deliberately blunt: a number the model invented is `unresolved`, and a source it
 * never cited is `uncited`, so the UI can say which claim has no evidence behind it.
 */

export type CitationSource = { index: number; title: string; url: string };
export type CitationLedger = { limit: number; sources: CitationSource[]; byKey: Map<string, CitationSource> };
export type CitationReport = { cited: number[]; unresolved: number[]; uncited: number[] };

/** A fragment is the same page, so it must not earn a second number. */
export function sourceKey(raw: string): string {
  try {
    const url = new URL(raw.trim());
    url.hash = "";
    return url.toString();
  } catch {
    return raw.trim();
  }
}

export function createLedger(limit = 12): CitationLedger {
  return { limit, sources: [], byKey: new Map() };
}

/** Returns the existing entry for a URL, a new one, or null once the loop has spent its budget. */
export function addSource(ledger: CitationLedger, input: { title?: string; url: string }): CitationSource | null {
  const key = sourceKey(input.url);
  if (!key) return null;
  const existing = ledger.byKey.get(key);
  if (existing) return existing;
  if (ledger.sources.length >= ledger.limit) return null;
  const source = { index: ledger.sources.length + 1, title: (input.title ?? "").trim().slice(0, 200) || input.url.trim(), url: input.url.trim() };
  ledger.sources.push(source);
  ledger.byKey.set(key, source);
  return source;
}

const CITE = /\[(\d{1,2})\]/g;

/** Code is not evidence: an array index inside a span or a fence is never read as a citation. */
const withoutCode = (text: string): string => text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");

export function citationReport(answer: string, sources: readonly { index: number; title?: string; url?: string }[]): CitationReport {
  const numbers = new Set<number>();
  for (const match of withoutCode(answer).matchAll(CITE)) {
    const n = Number(match[1]);
    if (n > 0) numbers.add(n);
  }
  const known = new Set(sources.map(source => source.index));
  return {
    cited: [...numbers].filter(n => known.has(n)).sort((a, b) => a - b),
    unresolved: [...numbers].filter(n => !known.has(n)).sort((a, b) => a - b),
    uncited: sources.map(source => source.index).filter(n => !numbers.has(n)),
  };
}
