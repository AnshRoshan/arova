/**
 * The capability layer: what a tool is, which ones this deployment can actually perform,
 * and what an agent is allowed to do with them.
 *
 * The rule this file exists to enforce: a grant can only ever narrow the set of tools that
 * genuinely run. Naming "browser" in an agent's config must never make a browser appear,
 * because the user would click it, wait, and get a lie.
 */

import { normaliseSkills } from "./skills.ts";

export type ToolKind = "delegation" | "workspace" | "external";

export type ToolSpec = {
  id: string;
  label: string;
  description: string;
  kind: ToolKind;
  /** Writes a row that changes workspace state, as opposed to producing text. */
  writes: boolean;
  /** Spec 17a: the gateway's risk class. READ never mutates; WRITE changes workspace state; EXTERNAL reaches beyond it. */
  risk: "READ" | "WRITE" | "EXTERNAL";
  available: boolean;
  whyUnavailable?: string;
};

export const TOOL_REGISTRY: ToolSpec[] = [
  { id: "consult_teammate", label: "Consult a teammate", description: "Ask one teammate a question and use their answer, keeping the floor yourself.", kind: "delegation", writes: false, risk: "READ", available: true },
  { id: "handoff", label: "Hand off", description: "Transfer the turn to a teammate, who then answers the user directly.", kind: "delegation", writes: false, risk: "READ", available: true },
  { id: "create_routine", label: "Propose routine", description: "Propose a routine for the user to confirm before it is saved.", kind: "workspace", writes: true, risk: "WRITE", available: true },
  { id: "request_approval", label: "Request approval", description: "Raise an action for the user to approve before it is recorded.", kind: "workspace", writes: true, risk: "WRITE", available: true },
  { id: "build_org", label: "Propose an organisation", description: "Propose a set of agents with reporting lines for the user to confirm before any of them exist.", kind: "workspace", writes: true, risk: "WRITE", available: true },
  
  { id: "save_note", label: "Record org memory", description: "Write a durable note into this organisation's memory, attributed to this seat and readable only inside it.", kind: "workspace", writes: true, risk: "WRITE", available: true },
  { id: "web_fetch", label: "Fetch a URL", description: "Read a web page the user names.", kind: "external", writes: false, risk: "READ", available: false, whyUnavailable: "No allow-list is configured: set TOOL_ALLOWED_HOSTS on the server and web_fetch goes live through the policy gateway." },
  { id: "web_search", label: "Web search", description: "Search the public web.", kind: "external", writes: false, risk: "READ", available: false, whyUnavailable: "No search provider is configured, and results would need a source to be citable." },
  { id: "browser", label: "Browser", description: "Operate a page in an isolated session.", kind: "external", writes: false, risk: "EXTERNAL", available: false, whyUnavailable: "No sandbox provider is wired, so nothing can host a browser session." },
  { id: "run_command", label: "Run command", description: "Execute a shell command in a workspace.", kind: "external", writes: true, risk: "EXTERNAL", available: false, whyUnavailable: "No isolated runtime exists here; commands would run on your machine, so this stays off." },
  { id: "read_file", label: "Read files", description: "Open files in a project workspace.", kind: "external", writes: false, risk: "READ", available: false, whyUnavailable: "There is no mounted workspace for an agent to read." },
  { id: "connect_gmail", label: "Gmail", description: "Read and draft in your inbox.", kind: "external", writes: true, risk: "WRITE", available: false, whyUnavailable: "OAuth connectors are not configured on this server." },
  { id: "connect_slack", label: "Slack", description: "Post and read in channels.", kind: "external", writes: true, risk: "WRITE", available: false, whyUnavailable: "OAuth connectors are not configured on this server." },
  { id: "connect_github", label: "GitHub", description: "Read issues and open pull requests.", kind: "external", writes: true, risk: "WRITE", available: false, whyUnavailable: "OAuth connectors are not configured on this server." },
  { id: "connect_calendar", label: "Calendar", description: "Read and create events.", kind: "external", writes: true, risk: "WRITE", available: false, whyUnavailable: "OAuth connectors are not configured on this server." },
];

export const LIVE_TOOL_IDS = TOOL_REGISTRY.filter(t => t.available).map(t => t.id);
const DELEGATION_IDS = ["consult_teammate", "handoff"];

/**
 * Spec 17a: availability is computed from configuration, never hardcoded. `web_fetch` is live the
 * moment an allow-list exists — the SSRF guard and the gateway gate every call after that.
 */
export function fetchAllowlistConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return (env.TOOL_ALLOWED_HOSTS ?? "").split(/[\s,]+/).map(h => h.trim().toLowerCase()).filter(Boolean).length > 0;
}

/** What the registry says about a tool right now, with runtime configuration applied. */
export function isToolAvailable(id: string, env: Record<string, string | undefined> = process.env): boolean {
  const spec = TOOL_REGISTRY.find(t => t.id === id);
  if (!spec) return false;
  return spec.id === "web_fetch" ? fetchAllowlistConfigured(env) : spec.available;
}

export type PermissionMode = "default" | "plan" | "auto";
export type Effort = "low" | "medium" | "high";
export type McpTransport = "stdio" | "http";
export type McpServer = { name: string; transport: McpTransport; /** Streamable-HTTP endpoint (spec 17c); stdio has none in this process. */ url?: string; /** Optional vault label (spec 17e) — the secret is resolved at call time, never stored here. */ credential?: string };
export type McpInheritance = "all" | "none" | { named: string[] } | { except: string[] };

export type Capabilities = {
  tools: string[];
  deniedTools: string[];
  permissionMode: PermissionMode;
  canConsult: string[];
  canHandoffTo: string[];
  effort: Effort;
  maxTurns: number | null;
  modelParams: { temperature?: number; maxTokens?: number };
  mcpServers: McpServer[];
  mcpInheritance: McpInheritance;
  /** Instruction packs from src/lib/skills.ts. Text only — a skill grants no tool. */
  skills: string[];
};

/** An agent starts able to do everything this deployment can genuinely perform. */
export const DEFAULT_CAPABILITIES: Capabilities = {
  tools: [...LIVE_TOOL_IDS],
  deniedTools: [],
  permissionMode: "default",
  canConsult: ["*"],
  canHandoffTo: [],
  effort: "medium",
  maxTurns: 8,
  modelParams: {},
  mcpServers: [],
  mcpInheritance: "all",
  skills: [],
};

const MAX_TURNS_CEILING = 25;
const EFFORT_TOKENS: Record<Effort, number> = { low: 400, medium: 800, high: 1600 };

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map(x => x.trim()) : []);

function applyInheritance(servers: McpServer[], inheritance: McpInheritance): McpServer[] {
  if (inheritance === "all") return servers;
  if (inheritance === "none") return [];
  if ("named" in inheritance) return servers.filter(s => inheritance.named.includes(s.name));
  return servers.filter(s => !inheritance.except.includes(s.name));
}

/**
 * Coerce anything a client sent into a safe capability record. Unknown tools are dropped
 * rather than rejected so a stale UI payload cannot brick an agent, and the permissive
 * modes are unreachable from here: widening an agent's power is a deliberate act in the UI.
 */
export function normaliseCapabilities(raw: unknown): Capabilities {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // Runtime-configurable tools are grantable too: a grant can only narrow what can really run, so
  // the grantable set must come from the same availability the gateway enforces (spec 17a).
  const grantable = new Set([...LIVE_TOOL_IDS, ...(fetchAllowlistConfigured() ? ["web_fetch"] : [])]);
  const tools = list(o.tools).filter(t => grantable.has(t));
  const denied = list(o.deniedTools).filter(t => grantable.has(t));
  const permissionMode: PermissionMode = ["default", "plan", "auto"].includes(str(o.permissionMode)) ? (o.permissionMode as PermissionMode) : DEFAULT_CAPABILITIES.permissionMode;
  const effort: Effort = ["low", "medium", "high"].includes(str(o.effort)) ? (o.effort as Effort) : DEFAULT_CAPABILITIES.effort;
  const rawTurns = o.maxTurns;
  const maxTurns = rawTurns === null ? null : Number.isFinite(Number(rawTurns)) ? Math.max(1, Math.min(MAX_TURNS_CEILING, Math.trunc(Number(rawTurns)))) : DEFAULT_CAPABILITIES.maxTurns;
  const params = (o.modelParams && typeof o.modelParams === "object" ? o.modelParams : {}) as Record<string, unknown>;
  const temperature = Number.isFinite(Number(params.temperature)) ? Math.max(0, Math.min(2, Number(params.temperature))) : undefined;
  const maxTokens = Number.isFinite(Number(params.maxTokens)) ? Math.max(64, Math.min(4000, Math.trunc(Number(params.maxTokens)))) : undefined;
  const servers: McpServer[] = (Array.isArray(o.mcpServers) ? o.mcpServers : [])
    .map(s => {
      const raw = (s as Record<string, unknown>) ?? {};
      const url = typeof raw.url === "string" ? raw.url.trim() : "";
      // Spec 17c: streamable HTTP first. A URL is kept only when it is a real http(s) endpoint —
      // a malformed one is dropped at normalisation, not stored to fail later.
      const safeUrl = url && /^https?:\/\//i.test(url) ? url.slice(0, 300) : undefined;
      const credential = typeof raw.credential === "string" && raw.credential.trim() ? raw.credential.trim().slice(0, 60) : undefined;
      return { name: str(raw.name).slice(0, 40), transport: str(raw.transport) as McpTransport, ...(safeUrl ? { url: safeUrl } : {}), ...(credential ? { credential } : {}) };
    })
    .filter(s => s.name)
    .map(s => ({ name: s.name, transport: s.transport === "http" ? "http" as const : "stdio" as const, ...(s.url ? { url: s.url } : {}), ...(s.credential ? { credential: s.credential } : {}) }));
  const inheritance: McpInheritance = o.mcpInheritance === "all" || o.mcpInheritance === "none" ? o.mcpInheritance
    : (o.mcpInheritance && typeof o.mcpInheritance === "object") ? (o.mcpInheritance as McpInheritance)
    : DEFAULT_CAPABILITIES.mcpInheritance;

  return {
    tools: tools.length ? Array.from(new Set(tools)) : [...DEFAULT_CAPABILITIES.tools],
    deniedTools: Array.from(new Set(denied)),
    permissionMode,
    canConsult: Array.isArray(o.canConsult) ? list(o.canConsult) : [...DEFAULT_CAPABILITIES.canConsult],
    canHandoffTo: Array.isArray(o.canHandoffTo) ? list(o.canHandoffTo) : [],
    effort,
    maxTurns,
    modelParams: { ...(temperature !== undefined ? { temperature } : {}), ...(maxTokens !== undefined ? { maxTokens } : {}) },
    mcpServers: applyInheritance(servers, inheritance),
    mcpInheritance: inheritance,
    skills: normaliseSkills(o.skills),
  };
}

export function resolveTools(caps: Capabilities, ctx: { hasTeam: boolean }): string[] {
  return Array.from(new Set(caps.tools))
    .filter(id => isToolAvailable(id))
    .filter(id => (DELEGATION_IDS.includes(id) ? ctx.hasTeam : true))
    .filter(id => !caps.deniedTools.includes(id));
}

export function toolLabel(id: string): string {
  return TOOL_REGISTRY.find(t => t.id === id)?.label ?? id;
}

/** "*" opens every teammate; an empty list opens nobody. The caller is never a valid target. */
export function allowsAction(caps: Capabilities, action: "consult_teammate" | "handoff", targetId: string): boolean {
  if (!targetId || targetId === "self") return false;
  const allow = action === "consult_teammate" ? caps.canConsult : caps.canHandoffTo;
  return allow.includes("*") || allow.includes(targetId);
}

export function planBlocks(toolId: string, mode: PermissionMode): boolean {
  if (mode !== "plan") return false;
  return TOOL_REGISTRY.find(t => t.id === toolId)?.writes ?? false;
}

export function tokenBudgetFor(caps: Capabilities): number {
  return caps.modelParams.maxTokens ?? EFFORT_TOKENS[caps.effort] ?? EFFORT_TOKENS.medium;
}

/**
 * MCP servers are configuration this build can store and display but not serve: with no
 * transport there is nothing to inherit, and saying so is better than a dead checkbox.
 */
export function mcpSummary(caps: Capabilities, ctx: { transportWired: boolean }): string {
  if (!caps.mcpServers.length) return "No MCP servers configured for this agent.";
  const names = caps.mcpServers.map(s => s.name).join(", ");
  if (!ctx.transportWired) return `${names} configured — no MCP transport is wired in this build, so these servers contribute no tools yet.`;
  return `${names} configured.`;
}
