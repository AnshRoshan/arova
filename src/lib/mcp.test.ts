import { test } from "node:test";
import assert from "node:assert/strict";
import { buildToolsCallRequest, buildToolsListRequest, classifyMcpTool, parseToolList, parseToolResult, redactArguments } from "./mcp.ts";

/**
 * Spec 17c — the MCP client's pure core: JSON-RPC message building, discovery parsing, and the
 * safe default that an unannotated tool is treated as a write (approval) until annotated.
 */

test("requests are JSON-RPC 2.0 with incrementing ids", () => {
  const list = buildToolsListRequest();
  assert.equal(list.jsonrpc, "2.0");
  assert.equal(list.method, "tools/list");
  assert.ok(list.id >= 1);
  const call = buildToolsCallRequest("weather.lookup", { city: "Oslo" });
  assert.equal(call.method, "tools/call");
  assert.equal(call.params.name, "weather.lookup");
  assert.deepEqual(call.params.arguments, { city: "Oslo" });
  assert.notEqual(call.id, list.id, "ids increment so a response can be matched");
});

test("discovery parses a tools/list response into tools", () => {
  const response = {
    jsonrpc: "2.0", id: 7,
    result: { tools: [
      { name: "search", description: "Search the web", annotations: { readOnlyHint: true } },
      { name: "create_event", description: "Create a calendar event" },
      { name: "danger", description: "Delete things", annotations: { destructiveHint: true } },
    ] },
  };
  const tools = parseToolList(response);
  assert.deepEqual(tools.map(t => ({ name: t.name, risk: t.risk })), [
    { name: "search", risk: "READ" },
    { name: "create_event", risk: "WRITE" },
    { name: "danger", risk: "EXTERNAL" },
  ]);
});

test("an unannotated MCP tool defaults to approval — the safe rule made concrete", () => {
  assert.equal(classifyMcpTool({ name: "mystery" }).risk, "WRITE");
  assert.equal(classifyMcpTool({ name: "mystery" }).source, "mcp-default");
});

test("a malformed discovery response yields no tools and a reason, never a crash", () => {
  assert.deepEqual(parseToolList({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "no such method" } }), []);
  assert.deepEqual(parseToolList(null), []);
  assert.deepEqual(parseToolList({ result: { tools: "not-an-array" } }), []);
});

test("a tool result returns its text content, truncated by the caller, and errors surface", () => {
  assert.equal(parseToolResult({ result: { content: [{ type: "text", text: "22 degrees" }] } }), "22 degrees");
  assert.equal(parseToolResult({ result: { content: [] } }), "");
  assert.equal(parseToolResult({ error: { message: "tool exploded" } }), null);
});

test("arguments are redacted for audit: keys that look secret keep only their shape", () => {
  const shown = redactArguments({ city: "Oslo", api_key: "sk-live-xyz", password: "hunter2", token: "tok_123", page: 2 });
  assert.deepEqual(shown, { city: "Oslo", api_key: "[redacted]", password: "[redacted]", token: "[redacted]", page: 2 });
});
import { mcpEndpointFromConfig, parseMcpSseResponse } from "./mcp.ts";

test("the SSE transport response yields the first JSON-RPC frame and refuses an empty stream", () => {
  const frame = parseMcpSseResponse('event: message\ndata: {"jsonrpc":"2.0","id":7,"result":{"tools":[]}}\n\ndata: garbage\n\n');
  assert.deepEqual(frame, { jsonrpc: "2.0", id: 7, result: { tools: [] } });
  assert.equal(parseMcpSseResponse("event: ping\n\n"), null);
});

test("an http MCP server needs an http(s) URL; a credential label rides along, never a value", () => {
  assert.deepEqual(mcpEndpointFromConfig({ name: "ops", transport: "http", url: "https://mcp.internal/mcp" }, { "ops": "cred-1" }), { url: "https://mcp.internal/mcp", credentialLabel: "cred-1" });
  assert.equal(mcpEndpointFromConfig({ name: "ops", transport: "stdio", url: "" }, {}), null, "stdio is local-dev-only and has no URL here");
  assert.equal(mcpEndpointFromConfig({ name: "ops", transport: "http", url: "ftp://x" }, {}), null);
});
