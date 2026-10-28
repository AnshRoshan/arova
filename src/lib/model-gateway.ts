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

function describe(name: string, label: string, base: string, model: string, maxContextTokens: number, configured: boolean, builtIn: boolean): ProviderProfile {
  return { name, label, base, model, maxContextTokens, configured, builtIn };
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
    const base = env[`${b.prefix}_BASE_URL`] || b.defaultBase;
    const model = env[`${b.prefix}_MODEL`] || (b.name === "openai" ? env.FAST_MODEL : undefined) || b.defaultModel;
    return describe(b.name, b.label, base, model, Number(env[`${b.prefix}_MAX_CONTEXT`]) || 128000, Boolean(apiKeyFor(b.name, env)), true);
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
      return describe(name, titleCase(name), base, model, Number(env[`${prefix}_MAX_CONTEXT`]) || 8192, configured, false);
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
  const key = apiKeyFor(profile.name);
  if (!key) throw new Error(`${profile.label} is selected, but its server API key is not configured.`);
  const endpoint = buildEndpoint(profile.base);
  const deadline = AbortSignal.timeout(timeoutMs);
  const stopSignal = signal ? AbortSignal.any([deadline, signal]) : deadline;
  // Some compatible servers reject an unknown stream_options field. Fall back to streaming without
  // the usage frame rather than failing the user's message.
  let requestUsage = stream;

  let lastError = "no attempt made";
  let forcedWait: number | null = null;
  for (let attempt = 0; attempt <= RETRYABLE_WAIT_MS.length; attempt++) {
    if (attempt) await wait(forcedWait ?? RETRYABLE_WAIT_MS[attempt - 1]);
    if (signal?.aborted) throw new Error("The request was stopped before it was sent.");
    forcedWait = null;
    const body = JSON.stringify(completionPayload({ profile, messages, maxTokens, stream, requestUsage, tools }));
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
    lastError = `HTTP ${response.status}`;
    // A server that rejects the stream_options field gets one retry of the same request
    // without it — losing the usage frame, not the user's message.
    if (requestUsage && (response.status === 400 || response.status === 422)) {
      requestUsage = false;
      continue;
    }
    if (!isRetryableStatus(response.status)) {
      const detail = truncate(await response.text().catch(() => ""));
      throw new Error(`${profile.label} returned ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    // Honour Retry-After once: the wait for the next attempt is its value, not that plus the fixed
    // backoff, and an HTTP-date (not a plain number of seconds) falls back to the fixed wait.
    const retryAfter = Number(response.headers.get("retry-after"));
    forcedWait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 8000) : null;
  }
  throw new Error(`${profile.label} did not respond (${lastError}) after ${RETRYABLE_WAIT_MS.length + 1} attempts.`);
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
