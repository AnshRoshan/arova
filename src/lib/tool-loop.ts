/**
 * The read-only tool loop: the model may call local tools and the policy-guarded fetch/search,
 * never a shell. The loop is bounded, audited, and returns the sources it actually used.
 *
 * Kept dependency-free of Next and the database so it can be tested with a fake completion.
 */

import type { ModelMessage, ToolCall, ToolDefinition } from "./model-gateway.ts";
import { runLocalTool } from "./local-tools.ts";
import { webFetch } from "./web-fetch.ts";
import { formatSearchResults, searchWeb, type SearchProfile, type SearchResult } from "./web-search.ts";

export const READONLY_TOOL_IDS = ["calc", "now_in_timezone", "json_transform", "checksum", "web_fetch"] as const;
export type ToolLoopEvent = { type: "tool"; name: string; status: "running" | "completed" | "failed"; detail?: string };
export type ToolExecution = { ok: boolean; output: string; sources?: SearchResult[] };
export type ToolLoopResult = { content: string; used: string[]; sources: { title: string; url: string }[]; partial: boolean };
export type ToolLoopDeps = { searchProfile?: SearchProfile; fetchImpl?: typeof fetch };
export type CompleteTurn = (messages: ModelMessage[], tools: ToolDefinition[]) => Promise<{ content: string; toolCalls: ToolCall[] }>;

const schema = (description: string, properties: Record<string, unknown>, required: string[]): ToolDefinition["function"]["parameters"] => ({
  type: "object", properties, required, additionalProperties: false,
});
const stringProp = (description: string) => ({ type: "string", description });

const SCHEMAS: Record<string, { description: string; parameters: Record<string, unknown> }> = {
  calc: { description: "Evaluate an arithmetic expression exactly as written (numbers, + - * / % ^, parentheses).", parameters: schema("Arithmetic expression.", { expression: stringProp("The expression, e.g. 2 * (3 + 4).") }, ["expression"]) },
  now_in_timezone: { description: "Read the current time (or a given instant) in a named IANA time zone.", parameters: schema("Time-zone lookup.", { zone: stringProp("IANA zone, e.g. Europe/Berlin."), instant: stringProp("Optional ISO instant; omit for now.") }, ["zone"]) },
  json_transform: { description: "Pretty-print a JSON document, or select one value with a dotted path prefixed by path::.", parameters: schema("JSON formatting/path query.", { input: stringProp("path::JSON or just JSON.") }, ["input"]) },
  checksum: { description: "Hash text with node:crypto. Use algo::text to choose md5, sha1, sha256, sha384 or sha512; default sha256.", parameters: schema("Hash a string.", { input: stringProp("algo::text or plain text.") }, ["input"]) },
  web_fetch: { description: "Read one public https page through the SSRF policy. No credentials, no private addresses, text only.", parameters: schema("Fetch a public page.", { url: stringProp("The https URL to read.") }, ["url"]) },
  web_search: { description: "Search the public web and return numbered results with titles, URLs and snippets. Cite the results you use as [1], [2].", parameters: schema("Search the web.", { query: stringProp("The search query.") }, ["query"]) },
};

export function toolDefinitions(ids: string[], searchConfigured: boolean): ToolDefinition[] {
  return ids
    .filter(id => id !== "web_search" || searchConfigured)
    .map(id => {
      const spec = SCHEMAS[id];
      return spec ? { type: "function" as const, function: { name: id, description: spec.description, parameters: spec.parameters } } : null;
    })
    .filter((definition): definition is ToolDefinition => Boolean(definition));
}

const str = (value: unknown): string => typeof value === "string" ? value : "";
const clamp = (value: string, limit: number): string => value.length <= limit ? value : `${value.slice(0, limit)}… truncated at ${limit} characters of ${value.length}`;

export async function executeToolCall(call: ToolCall, allowed: string[], deps: ToolLoopDeps = {}): Promise<ToolExecution> {
  const name = call.function.name;
  if (!allowed.includes(name)) return { ok: false, output: `Tool "${name}" is not granted to this seat.` };
  let args: Record<string, unknown>;
  try {
    const parsed = JSON.parse(call.function.arguments || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    args = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, output: "The tool arguments were not a JSON object." };
  }

  if (name === "web_fetch") {
    const fetched = await webFetch(str(args.url), { fetchImpl: deps.fetchImpl });
    return fetched.ok ? { ok: true, output: fetched.output } : { ok: false, output: fetched.error };
  }
  if (name === "web_search") {
    if (!deps.searchProfile?.configured) return { ok: false, output: "No search provider is configured on this server." };
    const found = await searchWeb(str(args.query), deps.searchProfile, { fetchImpl: deps.fetchImpl });
    if (!found.ok) return { ok: false, output: found.error };
    const formatted = formatSearchResults(found.results);
    return { ok: true, output: formatted.text, sources: found.results };
  }

  const inputs: Record<string, string> = {
    calc: str(args.expression),
    now_in_timezone: str(args.instant) ? `${str(args.zone)}@${str(args.instant)}` : str(args.zone),
    json_transform: str(args.input),
    checksum: str(args.input),
  };
  const input = inputs[name];
  if (input === undefined) return { ok: false, output: `Tool "${name}" is not a read-only tool this loop can run.` };
  const result = runLocalTool(name, input);
  return result.ok ? { ok: true, output: clamp(result.output ?? "", 4000) } : { ok: false, output: result.error ?? "The tool refused the input." };
}

export async function runToolLoop(input: {
  messages: ModelMessage[];
  tools: ToolDefinition[];
  allowed: string[];
  complete: CompleteTurn;
  onEvent?: (event: ToolLoopEvent) => void;
  audit?: (detail: string) => void;
  deps?: ToolLoopDeps;
  maxSteps?: number;
}): Promise<ToolLoopResult> {
  const messages = input.messages;
  const used: string[] = [];
  const sources: { title: string; url: string }[] = [];
  const seen = new Set<string>();
  const maxSteps = Math.max(1, Math.min(8, input.maxSteps ?? 4));
  let lastContent = "";

  for (let step = 0; step < maxSteps; step++) {
    const turn = await input.complete(messages, input.tools);
    lastContent = turn.content;
    if (!turn.toolCalls.length) return { content: lastContent, used, sources, partial: false };

    messages.push({ role: "assistant", content: turn.content || null, tool_calls: turn.toolCalls });
    for (const call of turn.toolCalls) {
      input.onEvent?.({ type: "tool", name: call.function.name, status: "running" });
      const started = Date.now();
      const result = await executeToolCall(call, input.allowed, input.deps);
      used.push(call.function.name);
      for (const source of result.sources ?? []) {
        if (!seen.has(source.url) && sources.length < 5) {
          seen.add(source.url);
          sources.push({ title: source.title, url: source.url });
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result.ok ? result.output : `Tool error: ${result.output}` });
      input.audit?.(`${call.function.name}: ${result.ok ? "ok" : "refused"} (${Date.now() - started}ms)`);
      input.onEvent?.({ type: "tool", name: call.function.name, status: result.ok ? "completed" : "failed", detail: result.ok ? undefined : result.output });
    }
  }

  return {
    content: lastContent.trim() || `Stopped after ${maxSteps} tool steps without a final answer.`,
    used,
    sources,
    partial: true,
  };
}
