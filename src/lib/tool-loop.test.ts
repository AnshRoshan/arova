import { test } from "node:test";
import assert from "node:assert/strict";
import { executeToolCall, runToolLoop, toolDefinitions } from "./tool-loop.ts";
import { loadSearchProfile } from "./web-search.ts";

const call = (name: string, args: Record<string, unknown>, id = "call-1") => ({ id, type: "function" as const, function: { name, arguments: JSON.stringify(args) } });

test("search is offered only when a provider is configured", () => {
  assert.deepEqual(toolDefinitions(["calc", "web_search"], false).map(t => t.function.name), ["calc"]);
  assert.deepEqual(toolDefinitions(["calc", "web_search"], true).map(t => t.function.name), ["calc", "web_search"]);
});

test("a local tool executes from the model's arguments", async () => {
  const result = await executeToolCall(call("calc", { expression: "2 + 3 * 4" }), ["calc"]);
  assert.equal(result.ok, true);
  assert.equal(result.output, "14");
});

test("an unknown or ungranted tool is refused, not executed", async () => {
  const unknown = await executeToolCall(call("run_command", { command: "rm -rf /" }), ["calc"]);
  assert.equal(unknown.ok, false);
  assert.match(unknown.output, /not granted/);
  const bad = await executeToolCall({ ...call("calc", {}), function: { name: "calc", arguments: "not json" } }, ["calc"]);
  assert.equal(bad.ok, false);
  assert.match(bad.output, /JSON object/);
});

test("search returns numbered text and sources", async () => {
  const result = await executeToolCall(call("web_search", { query: "q" }), ["web_search"], {
    searchProfile: loadSearchProfile({ SEARCH_PROVIDER: "searxng", SEARCH_BASE_URL: "https://search.example" }),
    fetchImpl: async () => new Response(JSON.stringify({ results: [{ title: "A", url: "https://a.example", content: "alpha" }] }), { status: 200 }),
  });
  assert.equal(result.ok, true);
  assert.match(result.output, /\[1\] A/);
  assert.deepEqual(result.sources, [{ title: "A", url: "https://a.example", snippet: "alpha" }]);
});

test("the loop executes a tool, feeds the result back, then returns the final answer", async () => {
  let turn = 0;
  const events: string[] = [];
  const result = await runToolLoop({
    messages: [{ role: "user", content: "what is 2+3?" }],
    tools: toolDefinitions(["calc"], false),
    allowed: ["calc"],
    complete: async () => {
      turn++;
      return turn === 1
        ? { content: "", toolCalls: [call("calc", { expression: "2+3" })] }
        : { content: "The answer is 5.", toolCalls: [] };
    },
    onEvent: event => events.push(`${event.name}:${event.status}`),
    audit: () => {},
  });
  assert.equal(result.content, "The answer is 5.");
  assert.deepEqual(result.used, ["calc"]);
  assert.equal(result.partial, false);
  assert.deepEqual(events, ["calc:running", "calc:completed"]);
});

test("the loop is bounded and says it stopped", async () => {
  const result = await runToolLoop({
    messages: [{ role: "user", content: "loop" }],
    tools: toolDefinitions(["calc"], false),
    allowed: ["calc"],
    maxSteps: 2,
    complete: async () => ({ content: "", toolCalls: [call("calc", { expression: "1+1" })] }),
  });
  assert.equal(result.partial, true);
  assert.match(result.content, /Stopped after 2 tool steps/);
  assert.equal(result.used.length, 2);
});

test("a tool error is fed back to the model, which can recover", async () => {
  let turn = 0;
  const seen: string[] = [];
  const result = await runToolLoop({
    messages: [{ role: "user", content: "try" }],
    tools: toolDefinitions(["calc"], false),
    allowed: ["calc"],
    complete: async messages => {
      turn++;
      if (turn === 1) return { content: "", toolCalls: [call("calc", { expression: "1/0" })] };
      seen.push(String(messages[messages.length - 1].content));
      return { content: "I could not divide by zero.", toolCalls: [] };
    },
    audit: () => {},
  });
  assert.equal(result.content, "I could not divide by zero.");
  assert.match(seen[0], /division by zero/i);
});
