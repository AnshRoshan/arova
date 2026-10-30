/**
 * Model gateway: one OpenAI-compatible client for every provider.
 *
 * Deliberately dependency-free (no local imports) so `node --test` can run this file
 * directly and the bundler never has to resolve an explicit ".ts" import specifier.
 */

export type Env = Record<string, string | undefined>;

export type ProviderProfile = {
  name: string;
  label: string;
  base: string;
  model: string;
  maxContextTokens: number;
  configured: boolean;
  builtIn: boolean;
  /** True when the model came from env. A pinned model is never swapped out behind the owner's back. */
  modelPinned?: boolean;
};

export type ToolDefinition = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ModelMessage = { role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };

/** Sentinel for workspaces with no model key: honest local replies, never a fabricated completion. */
export const LOCAL_PROFILE: ProviderProfile = { name: "local", label: "Local", base: "", model: "", maxContextTokens: 0, configured: false, builtIn: true };

const BUILT_INS = [
  { name: "xai", label: "Grok · xAI", prefix: "XAI", defaultBase: "https://api.x.ai/v1", defaultModel: "grok-4" },
  { name: "openai", label: "OpenAI", prefix: "OPENAI", defaultBase: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" },
];

export const MAX_HISTORY_TURNS = 64;
export const DEFAULT_RESERVE_TOKENS = 900;
export const RETRYABLE_WAIT_MS = [600, 1800];

export const envPrefix = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, "_");

/**
 * The only place a provider key is read. Profiles are serializable descriptions and
 * never carry the key, so a profile can be sent to the browser without leaking it.
 */
export function apiKeyFor(name: string, env: Env = process.env): string | undefined {
  if (name === "local") return undefined;
  const builtIn = BUILT_INS.find(b => b.name === name);
  return env[`${builtIn ? builtIn.prefix : envPrefix(name)}_API_KEY`] || undefined;
}

function describe(name: string, label: string, base: string, model: string, maxContextTokens: number, configured: boolean, builtIn: boolean, modelPinned = false): ProviderProfile {
  return { name, label, base, model, maxContextTokens, configured, builtIn, modelPinned };
}

function titleCase(name: string) {
  return name.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Built-in vendors are always selectable (so Settings can explain an unconfigured one);
 * `PROVIDERS="dahl ollama"` adds any OpenAI-compatible endpoint. Adding a vendor is an
 * env change, not a code change.
 */
export function loadProfiles(env: Env = process.env): ProviderProfile[] {
  const builtIns = BUILT_INS.map(b => {
    const pinned = env[`${b.prefix}_MODEL`] || (b.name === "openai" ? env.FAST_MODEL : undefined);
    const base = env[`${b.prefix}_BASE_URL`] || b.defaultBase;
    const model = pinned || b.defaultModel;
    return describe(b.name, b.label, base, model, Number(env[`${b.prefix}_MAX_CONTEXT`]) || 128000, Boolean(apiKeyFor(b.name, env)), true, Boolean(pinned));
  });

  const custom = (env.PROVIDERS || "")
    .split(/[,\s]+/)
    .map(name => name.trim())
    .filter(Boolean)
    .filter(name => !BUILT_INS.some(b => b.name === name))
    .map(name => {
      const prefix = envPrefix(name);
      const base = env[`${prefix}_BASE_URL`] || "";
      const model = env[`${prefix}_MODEL`] || "";
      const configured = Boolean(base) && Boolean(model) && Boolean(apiKeyFor(name, env));
      return describe(name, titleCase(name), base, model, Number(env[`${prefix}_MAX_CONTEXT`]) || 8192, configured, false, Boolean(model));
    });

  return [...builtIns, ...custom];
}

/**
 * `auto` walks configured vendors in priority order (xAI, OpenAI, then custom).
 * An explicitly chosen vendor is returned even when unconfigured so the caller can name
 * it in the failure reply; unknown names degrade to local rather than guessing a vendor.
 */
export function resolveForAgent(provider: string, profiles: ProviderProfile[]): ProviderProfile {
  if (provider === "local") return LOCAL_PROFILE;
  if (provider !== "auto") return profiles.find(p => p.name === provider) ?? LOCAL_PROFILE;
  return profiles.find(p => p.configured) ?? LOCAL_PROFILE;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Newest-first, whole turns only: dropping mid-turn would hand the model a dangling reply. */
export function trimToTokenBudget<T extends { role: string; content: string }>(history: T[], opts: { profile: ProviderProfile; reserve?: number }): T[] {
  const budget = Math.max(0, opts.profile.maxContextTokens - (opts.reserve ?? DEFAULT_RESERVE_TOKENS));
  const kept: T[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0 && kept.length < MAX_HISTORY_TURNS; i--) {
    const cost = estimateTokens(history[i].content);
    if (kept.length && used + cost > budget) break;
    kept.push(history[i]);
    used += cost;
  }
  return kept.reverse();
}

/** Base URL or full completions URL in, safe completions URL out. A bearer key rides on this request. */
export function buildEndpoint(base: string): string {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error(`Invalid provider base URL: ${base}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`Provider base URL must be http(s): ${base}`);
  if (url.pathname.endsWith("/chat/completions")) return url.toString();
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/chat/completions`;
  return url.toString();
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * The catalogue endpoint sits beside chat/completions on every OpenAI-compatible server, so the
 * same base URL works whether it was given as an API root or as a full completions URL.
 */
export function catalogEndpoint(base: string): string {
  const url = new URL(base);
  url.pathname = url.pathname.replace(/\/chat\/completions\/?$/, "").replace(/\/+$/, "") + "/models";
  return url.toString();
}

const NON_CHAT = /(embed|whisper|tts|dall-?e|image|audio|moderation|rerank|clip|stable-diffusion|sora|codex)/i;
const CHEAP = [[/flash/i, 5], [/mini/i, 5], [/fast/i, 4], [/small/i, 4], [/lite/i, 4], [/haiku/i, 3], [/instant/i, 3], [/turbo/i, 2]] as const;
const HEAVY = [[/opus/i, -6], [/reason/i, -4], [/thinking/i, -3], [/pro(?![a-z])/i, -3], [/max/i, -2], [/large/i, -2]] as const;

/**
 * Which served model to use when the configured one is not on the gateway. The owner's choice
 * always wins; otherwise cheap, fast chat models are preferred and embeddings, audio and image
 * models are never selected as a chat model. Pure so the choice can be tested without a network.
 */
export function chooseServedModel(ids: string[], preferred: string): { model: string; reason: "served" | "fallback" | "none" } {
  const chat = ids.filter(id => id && !NON_CHAT.test(id));
  if (chat.includes(preferred)) return { model: preferred, reason: "served" };
  if (!chat.length) return { model: "", reason: "none" };
  const score = (id: string) => {
    let total = 0;
    for (const [pattern, weight] of CHEAP) if (pattern.test(id)) total += weight;
    for (const [pattern, weight] of HEAVY) if (pattern.test(id)) total += weight;
    return total;
  };
  const [best] = [...chat].sort((a, b) => score(b) - score(a) || a.length - b.length || a.localeCompare(b));
  return { model: best, reason: "fallback" };
}

export type ModelCatalog = { ok: true; ids: string[] } | { ok: false; error: string };

/** Ask the provider what it actually serves. Bounded to a few seconds and never throws. */
export async function fetchModelCatalog(
  profile: ProviderProfile,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ModelCatalog> {
  if (profile.name === "local") return { ok: false, error: "the local provider has no catalogue" };
  const key = apiKeyFor(profile.name);
  if (!key) return { ok: false, error: "no API key is configured" };
  const doFetch = opts.fetchImpl ?? fetch;
  const deadline = AbortSignal.timeout(opts.timeoutMs ?? 5000);
  const signal = opts.signal ? AbortSignal.any([deadline, opts.signal]) : deadline;
  try {
    const response = await doFetch(catalogEndpoint(profile.base), { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const body = (await response.json()) as { data?: unknown; models?: unknown };
    const raw = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [];
    const ids = raw
      .map(entry => (typeof entry === "string" ? entry : (entry as { id?: unknown; name?: unknown })?.id ?? (entry as { name?: unknown })?.name))
      .filter((id): id is string => typeof id === "string" && id.trim() !== "");
    return ids.length ? { ok: true, ids } : { ok: false, error: "the gateway listed no models" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 160) : "catalogue unreachable" };
  }
}

export type ModelSelection = { name: string; model: string; auto: boolean; served: boolean; checkedAt: number; suggestion?: string };

type CatalogEntry = { at: number; ok: boolean; ids: string[]; error?: string };
const CATALOG_TTL_MS = 10 * 60_000;
const CATALOG_FAIL_TTL_MS = 60_000;
const catalogCache = new Map<string, CatalogEntry>();
const selections = new Map<string, ModelSelection>();

/** For tests and for a forced re-check; normal callers rely on the cache. */
export function resetModelCatalog() {
  catalogCache.clear();
  selections.clear();
}

/** What the gateway resolved to, for the board to show. Empty until a provider has been checked. */
export function modelSelections(): ModelSelection[] {
  return [...selections.values()];
}

const catalogKey = (profile: ProviderProfile) => `${profile.name}|${profile.base}|${profile.model}`;

/**
 * Resolve a configured provider to a model the gateway actually serves.
 *
 * A base URL that points somewhere other than the vendor's own API makes the vendor's default
 * model meaningless — the gateway may host a different catalogue entirely. When the model was not
 * pinned in env, the first successful probe picks a served chat model and records that it did;
 * when it was pinned, a missing model is reported and never silently replaced.
 */
export type ModelResolution = { profile: ProviderProfile; auto: boolean; served?: boolean; suggestion?: string; count?: number; error?: string };

export async function ensureServedModel(
  profile: ProviderProfile,
  opts: { fetchImpl?: typeof fetch; force?: boolean; signal?: AbortSignal } = {},
): Promise<ModelResolution> {
  if (profile.name === "local" || !profile.configured) return { profile, auto: false };
  const key = catalogKey(profile);
  const cached = catalogCache.get(key);
  const ttl = cached?.ok ? CATALOG_TTL_MS : CATALOG_FAIL_TTL_MS;
  if (cached && !opts.force && Date.now() - cached.at < ttl) return applyCatalog(profile, cached);
  const result = await fetchModelCatalog(profile, opts);
  const entry: CatalogEntry = result.ok ? { at: Date.now(), ok: true, ids: result.ids } : { at: Date.now(), ok: false, ids: [], error: result.error };
  catalogCache.set(key, entry);
  return applyCatalog(profile, entry);
}

function applyCatalog(profile: ProviderProfile, entry: CatalogEntry): ModelResolution {
  if (!entry.ok) return { profile, auto: false, error: entry.error };
  if (profile.modelPinned) {
    const served = entry.ids.includes(profile.model);
    const suggestion = served ? undefined : chooseServedModel(entry.ids, profile.model).model || undefined;
    selections.set(profile.name, { name: profile.name, model: profile.model, auto: false, served, checkedAt: entry.at, ...(suggestion ? { suggestion } : {}) });
    return { profile, auto: false, served, count: entry.ids.length, ...(suggestion ? { suggestion } : {}), ...(served ? {} : { error: `The gateway does not serve ${profile.model}.` }) };
  }
  const pick = chooseServedModel(entry.ids, profile.model);
  if (!pick.model) return { profile, auto: false, error: "the gateway listed no chat model" };
  const auto = pick.reason === "fallback";
  selections.set(profile.name, { name: profile.name, model: pick.model, auto, served: true, checkedAt: entry.at });
  return { profile: { ...profile, model: pick.model }, auto, served: true, count: entry.ids.length };
}

/** One SSE line in, assistant text out (empty for [DONE], role-only deltas or junk). */
export function sseDelta(line: string): string {
  const trimmed = line.replace(/\r$/, "").trim();
  if (!trimmed.startsWith("data:")) return "";
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return "";
  try {
    const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
    return typeof delta === "string" ? delta : "";
  } catch {
    return "";
  }
}

/** Incremental parse from a consumed offset; a partial trailing frame is left for the next call. */
export function parseStreamDelta(buffer: string, from = 0): { text: string; cursor: number }[] {
  const events: { text: string; cursor: number }[] = [];
  let i = from;
  while (true) {
    const nl = buffer.indexOf("\n", i);
    if (nl === -1) break;
    const line = buffer.slice(i, nl);
    i = nl + 1;
    const text = sseDelta(line);
    if (text) events.push({ text, cursor: i });
  }
  return events;
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Read an SSE reply until it ends or the reader leaves. On a stop the connection is cancelled —
 * leaving it open reads tokens nobody will see — while the text already received is kept, because
 * that is what the reader was shown.
 */
export async function readSseText(response: Response, onText: (chunk: string) => void, shouldStop?: () => boolean): Promise<{ text: string; finish: string; usage: { input: number; output: number } | null }> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Provider returned an empty stream");
  const decoder = new TextDecoder();
  let raw = "", answer = "", finish = "";
  let usage: { input: number; output: number } | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
    const lines = raw.split(String.fromCharCode(10));
    raw = lines.pop() ?? "";
    for (const line of lines) {
      const reason = finishReason(line);
      if (reason) finish = reason;
      const counted = usageFromSseLine(line);
      if (counted) usage = counted;
      const delta = sseDelta(line);
      if (!delta) continue;
      answer += delta;
      onText(delta);
    }
    if (shouldStop?.()) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  if (raw) { const tail = sseDelta(raw); if (tail) { answer += tail; onText(tail); } const t = finishReason(raw); if (t) finish = t; const u = usageFromSseLine(raw); if (u) usage = u; }
  return { text: answer, finish, usage };
}

/** "length" means the server stopped writing because of the output budget, which is ours,
 * not the model's. Without this the UI cannot tell a cut-off answer from a finished one. */
export function finishReason(line: string): string {
  const trimmed = line.replace(/\r$/, "").trim();
  if (!trimmed.startsWith("data:")) return "";
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return "";
  try {
    const reason = JSON.parse(payload)?.choices?.[0]?.finish_reason;
    return typeof reason === "string" ? reason : "";
  } catch {
    return "";
  }
}

/**
 * The request body. `stream_options` is what asks a compatible server to put real token counts in
 * the last SSE frame; without it a streamed reply has no usage at all and every figure on screen is
 * an estimate. Servers that do not know the field reject the request, so the caller retries without it.
 */
export function completionPayload(input: { profile: { model: string }; messages: ModelMessage[]; maxTokens?: number; stream: boolean; requestUsage?: boolean; tools?: ToolDefinition[] }): Record<string, unknown> {
  const requestUsage = input.requestUsage ?? input.stream;
  return {
    model: input.profile.model,
    messages: input.messages,
    max_tokens: input.maxTokens,
    ...(input.tools?.length ? { tools: input.tools, tool_choice: "auto" } : {}),
    ...(input.stream ? { stream: true, ...(requestUsage ? { stream_options: { include_usage: true } } : {}) } : {}),
  };
}

const strictNumber = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
const tokenPair = (usage: unknown): { input: number; output: number } | null => {
  const u = (usage && typeof usage === "object" ? usage : {}) as Record<string, unknown>;
  // Number(null) and Number("") are 0 — a server that reports the keys but not the
  // counts must read as "not reported", or a call gets stored as reported zeros.
  const input = strictNumber(u.prompt_tokens), output = strictNumber(u.completion_tokens);
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return null;
  return { input, output };
};

/** Real counts from a non-streaming body, or null when the server chose not to report them. */
export function usageFromJson(body: unknown): { input: number; output: number } | null {
  if (!body || typeof body !== "object") return null;
  return tokenPair((body as Record<string, unknown>).usage);
}

/** The usage frame of a stream — it arrives with no choices, so the delta parser never sees it. */
export function usageFromSseLine(line: string): { input: number; output: number } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return null;
  try {
    return tokenPair(JSON.parse(payload)?.usage);
  } catch {
    return null;
  }
}

export type CompletionRequest = {
  profile: ProviderProfile;
  messages: ModelMessage[];
  maxTokens?: number;
  stream: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  tools?: ToolDefinition[];
  /** Aborted when the reader leaves, so a stopped reply stops spending tokens. */
  signal?: AbortSignal;
};

/**
 * Bounded retries for the transient class only (429/5xx/network/timeout). A stream that
 * already started yielding text is never retried: replaying it would duplicate output.
 */
export async function requestCompletion({ profile, messages, maxTokens = 800, stream, timeoutMs = 45000, fetchImpl, tools, signal }: CompletionRequest): Promise<Response> {
  const doFetch = fetchImpl ?? fetch;
  // The configured model is only a guess when the owner pointed a vendor at a different gateway.
  // Proving it against the gateway's own catalogue costs one cached request and prevents a 404 on
  // the user's first message. Tests pass fetchImpl, so they never touch the network.
  const active = fetchImpl ? profile : (await ensureServedModel(profile, { signal })).profile;
  const key = apiKeyFor(active.name);
  if (!key) throw new Error(`${active.label} is selected, but its server API key is not configured.`);
  const endpoint = buildEndpoint(active.base);
  const deadline = AbortSignal.timeout(timeoutMs);
  const stopSignal = signal ? AbortSignal.any([deadline, signal]) : deadline;
  // Some compatible servers reject an unknown stream_options field. Fall back to streaming without
  // the usage frame rather than failing the user's message.
  let requestUsage = stream;

  let lastError = "no attempt made";
  let forcedWait: number | null = null;
  let catalogRetry = false;
  let effective = active;
  for (let attempt = 0; attempt <= RETRYABLE_WAIT_MS.length; attempt++) {
    if (attempt) await wait(forcedWait ?? RETRYABLE_WAIT_MS[attempt - 1]);
    if (signal?.aborted) throw new Error("The request was stopped before it was sent.");
    forcedWait = null;
    const body = JSON.stringify(completionPayload({ profile: effective, messages, maxTokens, stream, requestUsage, tools }));
    let response: Response;
    try {
      response = await doFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: stream ? "text/event-stream" : "application/json", Authorization: `Bearer ${key}` },
        body,
        signal: stopSignal,
      });
    } catch (error) {
      // A stopped caller is not a transient failure: retrying would spend the same budget again.
      if (signal?.aborted) throw error;
      lastError = error instanceof Error ? error.name : "network error";
      continue;
    }
    if (response.ok) return response;
    // A gateway that renamed or dropped the model answers 404 before any tokens are spent. Re-read
    // its catalogue once and retry with a model it does serve, unless the owner pinned this model.
    if (response.status === 404 && !catalogRetry && !fetchImpl && !effective.modelPinned) {
      const detail = truncate(await response.text().catch(() => ""));
      if (/model/i.test(detail) && /(not found|not available|does not exist|unknown|unavailable)/i.test(detail)) {
        catalogRetry = true;
        const resolved = await ensureServedModel(effective, { force: true, signal });
        if (resolved.profile.model !== effective.model) { effective = resolved.profile; continue; }
      }
      throw new Error(`${effective.label} returned 404${detail ? `: ${detail}` : ""}`);
    }
    lastError = `HTTP ${response.status}`;
    // A server that rejects the stream_options field gets one retry of the same request
    // without it — losing the usage frame, not the user's message.
    if (requestUsage && (response.status === 400 || response.status === 422)) {
      requestUsage = false;
      continue;
    }
    if (!isRetryableStatus(response.status)) {
      const detail = truncate(await response.text().catch(() => ""));
      throw new Error(`${effective.label} returned ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    // Honour Retry-After once: the wait for the next attempt is its value, not that plus the fixed
    // backoff, and an HTTP-date (not a plain number of seconds) falls back to the fixed wait.
    const retryAfter = Number(response.headers.get("retry-after"));
    forcedWait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 8000) : null;
  }
  throw new Error(`${effective.label} did not respond (${lastError}) after ${RETRYABLE_WAIT_MS.length + 1} attempts.`);
}

const truncate = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 160);

/** Non-streaming reply text from a Chat Completions body. */
export function completionText(data: unknown): string {
  const content = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Provider returned no text");
  return content.trim();
}

/** A non-streaming assistant message: text and/or tool calls. */
export function completionMessage(data: unknown): { content: string; toolCalls: ToolCall[] } {
  const message = (data as { choices?: { message?: { content?: unknown; tool_calls?: unknown } }[] })?.choices?.[0]?.message;
  const content = typeof message?.content === "string" ? message.content.trim() : "";
  const raw = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const toolCalls: ToolCall[] = raw.map(entry => {
    const call = entry as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
    return {
      id: typeof call.id === "string" ? call.id : "",
      type: "function" as const,
      function: {
        name: typeof call.function?.name === "string" ? call.function.name : "",
        arguments: typeof call.function?.arguments === "string" ? call.function.arguments : "{}",
      },
    };
  }).filter(call => call.id && call.function.name);
  return { content, toolCalls };
}

export type ToolCallDelta = { index: number; id?: string; name?: string; arguments?: string };

/** Streaming tool-call deltas. A call's id/name arrive once; arguments arrive in fragments. */
export function sseToolCallDeltas(line: string): ToolCallDelta[] {
  const trimmed = line.replace(/\r$/, "").trim();
  if (!trimmed.startsWith("data:")) return [];
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return [];
  try {
    const raw = JSON.parse(payload)?.choices?.[0]?.delta?.tool_calls;
    if (!Array.isArray(raw)) return [];
    return raw.map(entry => {
      const call = entry as { index?: unknown; id?: unknown; function?: { name?: unknown; arguments?: unknown } };
      return {
        index: Number.isFinite(Number(call.index)) ? Number(call.index) : 0,
        id: typeof call.id === "string" ? call.id : undefined,
        name: typeof call.function?.name === "string" ? call.function.name : undefined,
        arguments: typeof call.function?.arguments === "string" ? call.function.arguments : undefined,
      };
    });
  } catch {
    return [];
  }
}
