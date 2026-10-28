# Feature 21 — Read-only tool loop, search and citations

## The problem

Chat could produce text but could not call a tool. Search and citations were therefore impossible:
there was no tool-calling loop to execute a search, and no path to carry the result back into the
reply. The market brief ranks grounding/citations as a gap; this closes the local half.

## What it is

An **opt-in, per-agent, read-only tool loop**. When `Capabilities.toolLoop` is on, the model receives
the seat's granted read-only tools and may call them before answering:

- `calc`, `now_in_timezone`, `json_transform`, `checksum` — the existing local tools;
- `web_fetch` — the existing SSRF-policy fetch;
- `web_search` — only when a search provider is configured and the seat also holds `web_fetch`.

No shell, no browser, no writes, no connectors. A tool error is fed back to the model as a tool
result, not thrown into the run.

## Gateway

`model-gateway.ts` gained `ToolDefinition`, `ToolCall`, `ModelMessage`, `tools` in the completion
payload, `completionMessage()` (content + tool calls from a unary body) and `sseToolCallDeltas()`
(partial streaming tool calls for future use). The loop itself uses non-streaming turns because a
tool-call turn has no answer to stream; the final answer is sent as one `delta`. The UI labels this
state in the composer ("read-only tool loop on · no shell"), so it is not presented as token streaming.

## Loop

`src/lib/tool-loop.ts` is pure and testable:

- bounded at **4 steps** (hard ceiling 8);
- `toolDefinitions(ids, searchConfigured)` exposes only the allowed schemas;
- `executeToolCall` parses JSON args, refuses an unknown/ungranted tool, and executes the read-only
  tool; output is capped at 4,000 characters for the tool message;
- `runToolLoop` appends the assistant `tool_calls` and tool results, feeds errors back, records used
  tools/sources, emits `running/completed/failed` events, and returns `partial:true` with an honest
  stop line if the cap is hit;
- sources are deduplicated by URL and capped at 5.

Every model turn is counted through `recordUsage`; every tool call writes a `tool.called` event.

## Search

`src/lib/web-search.ts` is provider-neutral:

- `SEARCH_PROVIDER=searxng` + `SEARCH_BASE_URL` (JSON format);
- `SEARCH_PROVIDER=brave` + `SEARCH_API_KEY` (default Brave endpoint);
- `SEARCH_PROVIDER=custom` + `SEARCH_BASE_URL` (a `{results:[{title,url,snippet|content}]}` JSON API);
- a localhost endpoint is refused unless `SEARCH_ALLOW_LOCAL=1`;
- results are filtered to http(s), capped at 5, snippets at 500 characters, and formatted `[1]…`;
- the reply metadata carries `sources:[{title,url}]`; the UI prints a Sources line with real links.

## UI

Agent → Capabilities → **Tool loop** checkbox. While the loop runs, the live entry says
`using web_search` and shows a running/completed card. The final reply is stored with `toolsUsed` and
`sources`; the thread renders `Sources: [1] Arova docs` under the answer.

## Limits

- The model cannot call a shell, browser, connector or write tool through this loop.
- The answer is not token-streamed while the loop is on; it arrives after the loop.
- Search requires a provider and a key (Brave) or endpoint; no provider means no `web_search`.
- The loop is opt-in (default false); existing streaming is unchanged for other agents.
- This is not a replacement for the persistent desktop; it is read-only grounding.

## Verification

- `src/lib/tool-loop.test.ts` 7/7: schema filtering, local execution, unknown/ungranted refusal,
  search formatting/sources, a two-turn loop, the step cap, and a tool error recovery.
- `src/lib/web-search.test.ts` 6/6: profile readiness, SearXNG URL/format, Brave token/result shape,
  local guard, HTTP/empty refusals, numbered sources.
- `npm test` **232/232**; `tsc --noEmit` and `npm run build` green.
- **Live fixture (no vendor key):** a local OpenAI-compatible model + search server
  (`.impeccable/tool-loop-fixture.mjs`) returned a `web_search` call, then a final answer. The SSE
  contained `tool running/completed` and a `delta` "Arova is a workspace [1]."; the stored message had
  `toolsUsed:["web_search"]` and `sources:[{title:"Arova docs",url:"https://example.com/arova"}]`;
  `events` had `web_search: ok (4ms)`; usage was 2 calls with reported tokens; the UI showed the
  answer, the Sources link, and the tool-loop composer note.
- **Not verified:** a real vendor model and a real SearXNG/Brave endpoint. The fixture proves the
  loop/search/citation path; the provider paths are unit-tested.
