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
  assert.deepEqual(result.sources, [{ index: 1, title: "A", url: "https://a.example" }]);
});

test("two searches share one numbering, so [3] is the page the model actually read", async () => {
  const queries: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL) => {
    const query = new URL(String(input)).searchParams.get("q");
    queries.push(String(query));
    const results = query === "first"
      ? [{ title: "A", url: "https://a.example", content: "alpha" }, { title: "B", url: "https://b.example", content: "beta" }]
      : [{ title: "C", url: "https://c.example", content: "gamma" }, { title: "A", url: "https://a.example", content: "alpha again" }];
    return new Response(JSON.stringify({ results }), { status: 200 });
  };
  let turn = 0;
  const toolOutputs: string[] = [];
  const result = await runToolLoop({
    messages: [{ role: "user", content: "research" }],
    tools: toolDefinitions(["web_search"], true),
    allowed: ["web_search"],
    deps: { searchProfile: loadSearchProfile({ SEARCH_PROVIDER: "searxng", SEARCH_BASE_URL: "https://search.example" }), fetchImpl },
    complete: async messages => {
      turn++;
      const last = messages[messages.length - 1];
      if (last.role === "tool") toolOutputs.push(String(last.content));
      if (turn === 1) return { content: "", toolCalls: [call("web_search", { query: "first" }, "call-1")] };
      if (turn === 2) return { content: "", toolCalls: [call("web_search", { query: "second" }, "call-2")] };
      return { content: "C is the answer [3], A agrees [1], and nothing supports [9].", toolCalls: [] };
    },
  });
  assert.deepEqual(queries, ["first", "second"]);
  assert.match(toolOutputs[1], /\[3\] C/, "the second search continues the numbering");
  assert.match(toolOutputs[1], /\[1\] A/, "a page seen before keeps its number");
  assert.deepEqual(result.sources.map(source => source.url), ["https://a.example", "https://b.example", "https://c.example"]);
  assert.deepEqual(result.citations, { cited: [1, 3], unresolved: [9], uncited: [2] });
});

test("a fetched page is a numbered source too, with the URL that was actually read", async () => {
  let turn = 0;
  const result = await runToolLoop({
    messages: [{ role: "user", content: "read it" }],
    tools: toolDefinitions(["web_fetch"], false),
    allowed: ["web_fetch"],
    deps: {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      fetchImpl: async () => new Response("<html><title>Doc</title><body>Hello world</body></html>", { status: 200, headers: { "content-type": "text/html" } }),
    },
    complete: async () => {
      turn++;
      return turn === 1
        ? { content: "", toolCalls: [call("web_fetch", { url: "https://example.com/doc" })] }
        : { content: "The page says hello [1].", toolCalls: [] };
    },
  });
  assert.deepEqual(result.sources, [{ index: 1, title: "Doc", url: "https://example.com/doc" }]);
  assert.deepEqual(result.citations, { cited: [1], unresolved: [], uncited: [] });
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
