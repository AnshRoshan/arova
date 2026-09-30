import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CAPABILITIES, TOOL_REGISTRY, allowsAction, mcpSummary, normaliseCapabilities, planBlocks, resolveTools, tokenBudgetFor } from "./tools.ts";

const ids = TOOL_REGISTRY.map(t => t.id);

test("registry: every tool is described, and the available set is exactly what can really run", () => {
  assert.ok(TOOL_REGISTRY.length >= 10, "the registry should also carry the things that do NOT work");
  assert.ok(TOOL_REGISTRY.every(t => t.id && t.label && t.description && t.kind));
  const live = TOOL_REGISTRY.filter(t => t.available).map(t => t.id).sort();
  assert.deepEqual(live, ["build_org", "consult_teammate", "create_routine", "handoff", "request_approval"]);
});

test("registry: everything unavailable says why", () => {
  for (const t of TOOL_REGISTRY.filter(x => !x.available)) {
    assert.ok(t.whyUnavailable && t.whyUnavailable.length > 12, `${t.id} must explain its absence`);
  }
});

test("resolve: granted tools are intersected with what can run, and deny wins", () => {
  const caps = { ...DEFAULT_CAPABILITIES, tools: ["handoff", "browser", "no_such_tool", "request_approval"] };
  assert.deepEqual(resolveTools(caps, { hasTeam: true }).sort(), ["handoff", "request_approval"]);
  const denied = { ...caps, deniedTools: ["handoff"] };
  assert.deepEqual(resolveTools(denied, { hasTeam: true }), ["request_approval"]);
});

test("resolve: delegation tools vanish when the agent has no team", () => {
  const caps = { ...DEFAULT_CAPABILITIES, tools: ["consult_teammate", "handoff", "request_approval"] };
  assert.deepEqual(resolveTools(caps, { hasTeam: false }), ["request_approval"]);
  assert.deepEqual(resolveTools(caps, { hasTeam: true }).sort(), ["consult_teammate", "handoff", "request_approval"]);
});

test("normalise: junk input becomes safe defaults, never a crash or an escalation", () => {
  const caps = normaliseCapabilities("not an object");
  assert.deepEqual(caps.tools, DEFAULT_CAPABILITIES.tools);
  assert.equal(caps.permissionMode, DEFAULT_CAPABILITIES.permissionMode);
  const hostile = normaliseCapabilities({ tools: ["run_command", "browser", "request_approval"], permissionMode: "bypassPermissions", maxTurns: 99999, effort: "unheard-of" });
  assert.deepEqual(hostile.tools, ["request_approval"], "unavailable tools cannot be granted into existence");
  assert.notEqual(hostile.permissionMode, "bypassPermissions", "the most permissive mode must not be reachable by payload");
  assert.ok(hostile.maxTurns! <= 25, "turn cap is clamped");
  assert.equal(hostile.effort, DEFAULT_CAPABILITIES.effort);
});

test("allowsAction: the consult and handoff allow-lists are enforced per target", () => {
  const caps = normaliseCapabilities({ canConsult: ["peer-1"], canHandoffTo: ["*"] });
  assert.equal(allowsAction(caps, "consult_teammate", "peer-1"), true);
  assert.equal(allowsAction(caps, "consult_teammate", "peer-2"), false);
  assert.equal(allowsAction(caps, "handoff", "peer-2"), true, "wildcard opens every teammate");
  assert.equal(allowsAction(caps, "consult_teammate", "self"), false, "an agent is never a valid target for itself");
  const none = normaliseCapabilities({ canConsult: [], canHandoffTo: [] });
  assert.equal(allowsAction(none, "consult_teammate", "peer-1"), false);
});

test("plan mode blocks writes but not reading or delegating", () => {
  assert.equal(planBlocks("create_routine", "plan"), true);
  assert.equal(planBlocks("request_approval", "plan"), true);
  assert.equal(planBlocks("request_approval", "plan"), true);
  assert.equal(planBlocks("consult_teammate", "plan"), false);
  assert.equal(planBlocks("handoff", "plan"), false);
  assert.equal(planBlocks("create_routine", "auto"), false);
});

test("effort sets a real token budget and an explicit override still wins", () => {
  const low = tokenBudgetFor({ ...DEFAULT_CAPABILITIES, effort: "low" });
  const high = tokenBudgetFor({ ...DEFAULT_CAPABILITIES, effort: "high" });
  assert.ok(high > low, "high effort must actually buy more output");
  const pinned = tokenBudgetFor({ ...DEFAULT_CAPABILITIES, effort: "high", modelParams: { maxTokens: 123 } });
  assert.equal(pinned, 123);
});

test("mcp: configured servers are reported honestly while no transport exists", () => {
  const caps = normaliseCapabilities({ mcpServers: [{ name: "github", transport: "stdio" }], mcpInheritance: "all" });
  const note = mcpSummary(caps, { transportWired: false });
  assert.match(note, /github/);
  assert.match(note, /no MCP transport|not wired|cannot/i);
  assert.equal(resolveTools(caps, { hasTeam: true }).includes("mcp:github"), false, "an MCP server must not conjure a tool");
  const inherited = normaliseCapabilities({ mcpServers: [{ name: "a" }, { name: "b" }], mcpInheritance: { except: ["a"] } });
  assert.deepEqual(inherited.mcpServers.map(s => s.name), ["b"]);
});
