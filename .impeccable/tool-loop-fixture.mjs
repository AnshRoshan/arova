/**
 * A local fixture for the tool loop: OpenAI-compatible chat completions + a search endpoint.
 * It lets the loop/search/citation path be proven without a vendor key.
 *
 * The script is fixed on purpose: two searches (the second repeats one URL, the first's numbering
 * must survive) and a final answer that cites [1], [3] and invents [9] — so the citation report,
 * the stable numbering and the unresolved-citation warning can all be observed end to end.
 *
 *   node .impeccable/tool-loop-fixture.mjs
 *   PROVIDERS=fixture FIXTURE_BASE_URL=http://127.0.0.1:8788/v1 FIXTURE_MODEL=fixture \
 *   FIXTURE_API_KEY=test SEARCH_PROVIDER=custom SEARCH_BASE_URL=http://127.0.0.1:8788/search \
 *   SEARCH_ALLOW_LOCAL=1 AROVA_SANDBOX_PROVIDER=local-os npm run dev
 */
import { createServer } from "node:http";

const PORT = 8788;
const DELAY_MS = 1200;
const stats = { calls: 0, delayed: 0, aborted: 0 };
const RESULTS = {
  one: [
    { title: "Arova docs", url: "https://example.com/a", content: "Arova is a workspace for named agents." },
    { title: "Arova notes", url: "https://example.com/b", content: "Notes on the bench." },
  ],
  two: [
    { title: "Arova pricing", url: "https://example.com/c", content: "Pricing is unannounced." },
    { title: "Arova docs", url: "https://example.com/a", content: "Arova is a workspace for named agents." },
  ],
};
const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
    stats.calls++;
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("close", () => { if (!response.writableEnded) stats.aborted++; });
    request.on("end", () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch { /* the fixture only needs messages */ }
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      const toolResults = messages.filter(message => message.role === "tool").length;
      const hasTools = Array.isArray(parsed.tools) && parsed.tools.length > 0;
      const system = typeof messages[0]?.content === "string" ? messages[0].content : "";
      let payload = null;
      let sse = null;
      let delay = 0;

      if (hasTools) {
        // The tool-loop script: two searches, then an answer that cites [1], [3] and invents [9].
        payload = toolResults === 0
          ? {
              id: "fixture", object: "chat.completion",
              choices: [{
                index: 0,
                message: { role: "assistant", content: "", tool_calls: [{ id: "call_one", type: "function", function: { name: "web_search", arguments: JSON.stringify({ query: "one" }) } }] },
                finish_reason: "tool_calls",
              }],
              usage: { prompt_tokens: 90, completion_tokens: 6 },
            }
          : toolResults === 1
            ? {
                id: "fixture", object: "chat.completion",
                choices: [{
                  index: 0,
                  message: { role: "assistant", content: "", tool_calls: [{ id: "call_two", type: "function", function: { name: "web_search", arguments: JSON.stringify({ query: "two" }) } }] },
                  finish_reason: "tool_calls",
                }],
                usage: { prompt_tokens: 110, completion_tokens: 6 },
              }
            : {
                id: "fixture", object: "chat.completion",
                choices: [{ index: 0, message: { role: "assistant", content: "Arova is a workspace [1]. Pricing is unannounced [3]. Nothing supports [9]." }, finish_reason: "stop" }],
                usage: { prompt_tokens: 140, completion_tokens: 20 },
              };
        // The loop's later turns wait, so a reader's Stop has a real window to abort one in flight.
        if (toolResults > 0) delay = DELAY_MS;
      } else if (parsed.stream) {
        // A brief report, as SSE the real stream reader understands.
        sse = [
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "The fixture report." }, finish_reason: null }] })}`,
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}`,
          "data: [DONE]",
          "",
        ].join("\n\n");
      } else if (/You are a router/i.test(system)) {
        payload = { id: "fixture", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: "{\"action\":\"none\"}" }, finish_reason: "stop" }], usage: { prompt_tokens: 80, completion_tokens: 4 } };
      } else {
        // A seat answering a summon: slow, so the reader's Stop can land while it is in flight.
        payload = { id: "fixture", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: "The fixture seat answer." }, finish_reason: "stop" }], usage: { prompt_tokens: 70, completion_tokens: 5 } };
        delay = DELAY_MS;
      }

      const reply = () => {
        if (response.writableEnded) return;
        if (sse) {
          response.writeHead(200, { "content-type": "text/event-stream" });
          response.end(sse);
          return;
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(payload));
      };
      if (delay) { stats.delayed++; setTimeout(reply, delay); } else reply();
    });
    return;
  }
  if (request.method === "GET" && url.pathname === "/stats") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(stats));
    return;
  }
  if (request.method === "POST" && url.pathname === "/stats/reset") {
    Object.assign(stats, { calls: 0, delayed: 0, aborted: 0 });
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
    return;
  }
  if (request.method === "GET" && url.pathname === "/search") {
    const query = url.searchParams.get("q") === "two" ? "two" : "one";
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ results: RESULTS[query] }));
    return;
  }
  response.writeHead(404, { "content-type": "text/plain" });
  response.end("not found");
});
server.listen(PORT, "127.0.0.1", () => console.log(`fixture on http://127.0.0.1:${PORT}`));
