/**
 * Search: a provider-neutral adapter, not a vendor lock.
 *
 * The operator configures one endpoint. SearXNG and custom JSON endpoints need no key; Brave needs
 * one. The tool output is numbered so a reply can cite [1], [2]; the sources travel back to the UI
 * with the reply. No search provider means the tool is absent, not a fabricated answer.
 */

export type SearchProvider = "searxng" | "brave" | "custom" | "none";
export type SearchResult = { title: string; url: string; snippet: string };
export type SearchProfile = { provider: SearchProvider; endpoint: string; apiKey: string; allowLocal: boolean; configured: boolean };

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

export function loadSearchProfile(env: Record<string, string | undefined> = process.env): SearchProfile {
  const raw = (env.SEARCH_PROVIDER ?? "").trim().toLowerCase();
  const provider: SearchProvider = raw === "searxng" || raw === "brave" || raw === "custom" ? raw : "none";
  const endpoint = (env.SEARCH_BASE_URL ?? (provider === "brave" ? BRAVE_ENDPOINT : "")).trim();
  const apiKey = (env.SEARCH_API_KEY ?? env.BRAVE_SEARCH_API_KEY ?? "").trim();
  return {
    provider,
    endpoint,
    apiKey,
    allowLocal: env.SEARCH_ALLOW_LOCAL === "1",
    configured: provider !== "none" && Boolean(endpoint) && (provider !== "brave" || Boolean(apiKey)),
  };
}

type SearchDeps = { fetchImpl?: typeof fetch; timeoutMs?: number };

function buildUrl(profile: SearchProfile, query: string): { url: URL } | { error: string } {
  let base: URL;
  try { base = new URL(profile.endpoint); } catch { return { error: "SEARCH_BASE_URL is not a URL." }; }
  if (base.protocol !== "https:" && base.protocol !== "http:") return { error: "The search endpoint must be http(s)." };
  const local = ["localhost", "127.0.0.1", "::1"].includes(base.hostname.toLowerCase());
  if (local && !profile.allowLocal) return { error: "A local search endpoint needs SEARCH_ALLOW_LOCAL=1." };
  // A search key and the user's query are not sent over plain http to a remote host.
  if (base.protocol === "http:" && !local) return { error: "A remote search endpoint must be https; plain http is allowed only for a local endpoint with SEARCH_ALLOW_LOCAL=1." };
  let url: URL;
  if (profile.provider === "searxng") {
    url = base.pathname.replace(/\/+$/, "").endsWith("/search") ? base : new URL("search", base.pathname.endsWith("/") ? base : `${base.toString()}/`);
  } else {
    url = base;
  }
  url.searchParams.set("q", query);
  if (profile.provider === "searxng") url.searchParams.set("format", "json");
  return { url };
}

export async function searchWeb(query: string, profile: SearchProfile, deps: SearchDeps = {}): Promise<{ ok: true; results: SearchResult[] } | { ok: false; error: string }> {
  if (!profile.configured) return { ok: false, error: "No search provider is configured. Set SEARCH_PROVIDER and SEARCH_BASE_URL (Brave also needs SEARCH_API_KEY)." };
  const q = query.trim();
  if (!q) return { ok: false, error: "The search query is empty." };
  const built = buildUrl(profile, q);
  if ("error" in built) return { ok: false, error: built.error };

  const headers: Record<string, string> = { accept: "application/json", "user-agent": "Arova/1.0 (+workspace search tool)" };
  if (profile.provider === "brave") headers["x-subscription-token"] = profile.apiKey;
  else if (profile.apiKey) headers.authorization = `Bearer ${profile.apiKey}`;

  try {
    const response = await (deps.fetchImpl ?? fetch)(built.url.toString(), { headers, signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000) });
    if (!response.ok) return { ok: false, error: `The search provider answered ${response.status}.` };
    const body = await response.json() as { results?: unknown; web?: { results?: unknown } };
    const raw = profile.provider === "brave" ? body.web?.results : body.results;
    const results = (Array.isArray(raw) ? raw : []).map(entry => {
      const row = entry as { title?: unknown; url?: unknown; snippet?: unknown; content?: unknown; description?: unknown };
      const title = typeof row.title === "string" ? row.title.trim().slice(0, 200) : "";
      const url = typeof row.url === "string" ? row.url.trim() : "";
      const snippet = typeof row.snippet === "string" ? row.snippet : typeof row.content === "string" ? row.content : typeof row.description === "string" ? row.description : "";
      if (!/^https?:\/\//i.test(url)) return null;
      return { title: title || url, url, snippet: snippet.replace(/\s+/g, " ").trim().slice(0, 500) };
    }).filter((result): result is SearchResult => Boolean(result)).slice(0, 5);
    if (!results.length) return { ok: false, error: "The search provider returned no usable results." };
    return { ok: true, results };
  } catch (error) {
    return { ok: false, error: `The search provider could not be reached (${error instanceof Error ? error.name : "network error"}).` };
  }
}

/**
 * Formats results for the model. `numbers` comes from the loop's citation ledger so a second search
 * continues the numbering instead of starting at [1] again; null means the source budget is spent
 * and the result is context only, never citable.
 */
export function formatSearchResults(results: SearchResult[], numbers?: (number | null)[]): { text: string; sources: { title: string; url: string }[] } {
  const sources = results.map(result => ({ title: result.title, url: result.url }));
  const text = results.map((result, index) => {
    const n = numbers ? numbers[index] : index + 1;
    return `[${n ?? "-"}] ${result.title}\n${result.url}\n${result.snippet}`;
  }).join("\n\n");
  return { text, sources };
}
