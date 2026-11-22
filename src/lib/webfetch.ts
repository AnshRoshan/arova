/**
 * Spec 17d — the web_fetch adapter's text handling. The gateway (route side) owns the SSRF guard,
 * the allow-list and the HTTP call; this module owns what the model is allowed to read: plain
 * extracted text, capped, with the cut stated.
 */

const DEFAULT_FETCH_CAP = 8000;

export function parseFetchCap(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_FETCH_CAP;
}

/** Markup and scripts are noise to the model; entities and runs of space collapse to readable text. */
export function extractText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}
