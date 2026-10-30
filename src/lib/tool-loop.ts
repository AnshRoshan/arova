/**
 * The read-only tool loop: the model may call local tools and the policy-guarded fetch/search,
 * never a shell. The loop is bounded, audited, and returns the sources it actually used.
 *
 * Kept dependency-free of Next and the database so it can be tested with a fake completion.
 */

import type { ModelMessage, ToolCall, ToolDefinition } from "./model-gateway.ts";
import { runLocalTool } from "./local-tools.ts";
import { webFetch, type FetchPolicy } from "./web-fetch.ts";
import { addSource, citationReport, createLedger, type CitationLedger, type CitationReport, type CitationSource } from "./citations.ts";
import { splitReasoning } from "./markdown.ts";
import { formatSearchResults, searchWeb, type SearchProfile } from "./web-search.ts";

export const READONLY_TOOL_IDS = ["calc", "now_in_timezone", "json_transform", "checksum", "web_fetch"] as const;
export type ToolLoopEvent = { type: "tool"; name: string; status: "running" | "completed" | "failed"; detail?: string };
export type ToolExecution = { ok: boolean; output: string; sources?: CitationSource[] };
export type ToolLoopResult = { content: string; used: string[]; sources: CitationSource[]; citations: CitationReport; partial: boolean; stopped: boolean; /** The loop ran out of steps, which is not the output-token cap. */ stepLimit: boolean };
export type ToolLoopDeps = { searchProfile?: SearchProfile; fetchImpl?: typeof fetch; lookup?: FetchPolicy["lookup"] };
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

export async function executeToolCall(call: ToolCall, allowed: string[], deps: ToolLoopDeps = {}, ledger: CitationLedger = createLedger()): Promise<ToolExecution> {
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
    const fetched = await webFetch(str(args.url), { fetchImpl: deps.fetchImpl, lookup: deps.lookup });
    if (!fetched.ok) return { ok: false, output: fetched.error };
    // A page that was read is a source in its own right; without this it could inform the answer
    // and never appear in the list of what the answer stands on.
    const source = addSource(ledger, { title: fetched.title, url: fetched.url });
    return { ok: true, output: source ? `[${source.index}] ${fetched.output}` : fetched.output, sources: source ? [source] : [] };
  }
  if (name === "web_search") {
    if (!deps.searchProfile?.configured) return { ok: false, output: "No search provider is configured on this server." };
    const found = await searchWeb(str(args.query), deps.searchProfile, { fetchImpl: deps.fetchImpl });
    if (!found.ok) return { ok: false, output: found.error };
    // Numbers come from the loop-wide ledger, so two searches never both claim [1].
    const sources = found.results.map(result => addSource(ledger, { title: result.title, url: result.url }));
    const formatted = formatSearchResults(found.results, sources.map(source => source?.index ?? null));
    return { ok: true, output: formatted.text, sources: sources.filter((source): source is CitationSource => Boolean(source)) };
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
  /** Polled between model turns and tool calls: a reader who left must not buy another turn. */
  shouldStop?: () => boolean;
}): Promise<ToolLoopResult> {
  const messages = input.messages;
  const used: string[] = [];
  const ledger = createLedger();
  const maxSteps = Math.max(1, Math.min(8, input.maxSteps ?? 4));
  let lastContent = "";
  // The report runs on the answer, not on reasoning: a number mentioned while thinking is not a claim.
  const finish = (content: string, partial: boolean, stopped = false, stepLimit = false): ToolLoopResult => ({
    content,
    used,
    sources: ledger.sources,
    citations: citationReport(splitReasoning(content).answer, ledger.sources),
    partial,
    stopped,
    stepLimit,
  });

  for (let step = 0; step < maxSteps; step++) {
    if (input.shouldStop?.()) return finish(lastContent, true, true);
    const turn = await input.complete(messages, input.tools);
    lastContent = turn.content;
    if (!turn.toolCalls.length) return finish(lastContent, false);

    messages.push({ role: "assistant", content: turn.content || null, tool_calls: turn.toolCalls });
    for (const call of turn.toolCalls) {
      // A tool already under way is finished — its result is real and half a command is worse than
      // none — but nothing new is started after the reader leaves.
      if (input.shouldStop?.()) return finish(lastContent, true, true);
      input.onEvent?.({ type: "tool", name: call.function.name, status: "running" });
      const started = Date.now();
      const result = await executeToolCall(call, input.allowed, input.deps, ledger);
      used.push(call.function.name);
      messages.push({ role: "tool", tool_call_id: call.id, content: result.ok ? result.output : `Tool error: ${result.output}` });
      input.audit?.(`${call.function.name}: ${result.ok ? "ok" : "refused"} (${Date.now() - started}ms)`);
      input.onEvent?.({ type: "tool", name: call.function.name, status: result.ok ? "completed" : "failed", detail: result.ok ? undefined : result.output });
    }
  }

  return finish(lastContent.trim() || `Stopped after ${maxSteps} tool steps without a final answer.`, true, false, true);
}
