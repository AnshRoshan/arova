/**
 * Spec 17c — the MCP client's pure core. Message building, discovery parsing and argument
 * redaction live here; the transport (streamable HTTP first, stdio for local dev) is a thin
 * caller. An MCP server may add tools, but its tools are untrusted: an unannotated tool is a
 * write (approval required) until its annotations say otherwise.
 */

export type McpTool = { name: string; description: string; risk: "READ" | "WRITE" | "EXTERNAL"; source: string };

let nextId = 1;

export function buildToolsListRequest(): { jsonrpc: "2.0"; id: number; method: "tools/list"; params: Record<string, never> } {
  return { jsonrpc: "2.0", id: nextId++, method: "tools/list", params: {} };
}

export function buildToolsCallRequest(name: string, args: Record<string, unknown>): { jsonrpc: "2.0"; id: number; method: "tools/call"; params: { name: string; arguments: Record<string, unknown> } } {
  return { jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } };
}

/** An unannotated tool is a write — approval required — following the safe default. */
export function classifyMcpTool(tool: { name: string; description?: string; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }): McpTool {
  const risk = tool.annotations?.destructiveHint ? "EXTERNAL" : tool.annotations?.readOnlyHint ? "READ" : "WRITE";
  return { name: tool.name, description: tool.description ?? "", risk, source: "mcp-default" };
}

export function parseToolList(response: unknown): McpTool[] {
  const tools = (response as { result?: { tools?: unknown } } | null)?.result?.tools;
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((t) => {
    const tool = t as { name?: unknown; description?: unknown; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } };
    if (typeof tool?.name !== "string") return [];
    return [classifyMcpTool({ name: tool.name, description: typeof tool.description === "string" ? tool.description : undefined, annotations: tool.annotations })];
  });
}

/** Text content joined; a JSON-RPC error surfaces as null so the gateway records a tool error. */
export function parseToolResult(response: unknown): string | null {
  const error = (response as { error?: { message?: string } } | null)?.error;
  if (error) return null;
  const content = (response as { result?: { content?: unknown } } | null)?.result?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c): c is { type: "text"; text: string } => (c as { type?: string })?.type === "text" && typeof (c as { text?: string })?.text === "string")
    .map((c) => c.text)
    .join("\n");
}

const SECRET_KEY = /pass(word)?|secret|token|api[-_]?key|credential|bearer|auth/i;

/** Audit rows quote arguments, but a quoted argument must never be a credential. */
export function redactArguments(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).map(([k, v]) => [k, SECRET_KEY.test(k) ? "[redacted]" : v]));
}

/** A transport endpoint resolved from a seat's server config. The credential LABEL rides; the
 * secret itself is resolved from the vault at call time and never stored here. */
export type McpEndpoint = { url: string; authorization?: string; credentialLabel?: string };

/** Streamable HTTP first (spec 17c); stdio has no URL in this process and is refused. */
export function mcpEndpointFromConfig(server: { name: string; transport: string; url?: string }, credentialsByServer: Record<string, string>): McpEndpoint | null {
  if (server.transport !== "http" || !server.url) return null;
  let url: URL;
  try {
    url = new URL(server.url);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const credentialLabel = credentialsByServer[server.name];
  return { url: server.url, ...(credentialLabel ? { credentialLabel } : {}) };
}

/** A streamable-HTTP reply may arrive as SSE; the first parseable `data:` JSON-RPC frame is the answer. */
export function parseMcpSseResponse(text: string): unknown | null {
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw) continue;
    try {
      return JSON.parse(raw);
    } catch {
      // a keep-alive or event frame — keep scanning
    }
  }
  return null;
}

/**
 * Streamable-HTTP transport, stateless v1: every call is a self-contained POST and no session id
 * is persisted — a server that requires sessions fails honestly at discovery, which the UI shows
 * as dormant rather than pretending the server contributes tools.
 */
async function mcpRequest(endpoint: McpEndpoint, payload: unknown, authorization: string | undefined, timeoutMs: number): Promise<unknown> {
  const res = await fetch(endpoint.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`MCP server answered HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const frame = parseMcpSseResponse(await res.text());
    if (frame === null) throw new Error("MCP stream carried no JSON-RPC response");
    return frame;
  }
  return res.json();
}

const MCP_PROTOCOL_VERSION = "2025-06-18";

/** Discovery = initialize + tools/list. Bounded by the caller's timeout; failures are honest. */
export async function mcpDiscoverTools(endpoint: McpEndpoint, authorization: string | undefined, timeoutMs = 10_000): Promise<McpTool[]> {
  const init = await mcpRequest(endpoint, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "arova", version: "1.0" } } }, authorization, timeoutMs);
  if ((init as { error?: { message?: string } } | null)?.error) {
    throw new Error(`MCP initialize refused: ${String((init as { error: { message?: string } }).error.message ?? "unknown")}`);
  }
  const list = await mcpRequest(endpoint, buildToolsListRequest(), authorization, timeoutMs);
  return parseToolList(list);
}

/** One tool call. A JSON-RPC error surfaces as a thrown, quoted reason — never a fabricated result. */
export async function mcpCallTool(endpoint: McpEndpoint, name: string, args: Record<string, unknown>, authorization: string | undefined, timeoutMs = 20_000): Promise<string> {
  const response = await mcpRequest(endpoint, buildToolsCallRequest(name, args), authorization, timeoutMs);
  const text = parseToolResult(response);
  if (text === null) {
    const why = (response as { error?: { message?: string } } | null)?.error?.message ?? "the tool returned no text";
    throw new Error(why);
  }
  return text;
}
