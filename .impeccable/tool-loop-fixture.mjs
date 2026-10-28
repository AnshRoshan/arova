/**
 * A local fixture for the tool loop: OpenAI-compatible chat completions + a search endpoint.
 * It lets the loop/search/citation path be proven without a vendor key.
 *
 *   node .impeccable/tool-loop-fixture.mjs
 *   PROVIDERS=fixture FIXTURE_BASE_URL=http://127.0.0.1:8788/v1 FIXTURE_MODEL=fixture \
 *   FIXTURE_API_KEY=test SEARCH_PROVIDER=custom SEARCH_BASE_URL=http://127.0.0.1:8788/search \
 *   SEARCH_ALLOW_LOCAL=1 AROVA_SANDBOX_PROVIDER=local-os npm run dev
 */
import { createServer } from "node:http";

const PORT = 8788;
const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch { /* the fixture only needs messages */ }
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      const hasToolResult = messages.some(message => message.role === "tool");
      const payload = hasToolResult
        ? {
            id: "fixture", object: "chat.completion",
            choices: [{ index: 0, message: { role: "assistant", content: "Arova is a workspace [1]." }, finish_reason: "stop" }],
            usage: { prompt_tokens: 120, completion_tokens: 8 },
          }
        : {
            id: "fixture", object: "chat.completion",
            choices: [{
              index: 0,
              message: {
                role: "assistant",
                content: "",
                tool_calls: [{ id: "call_search", type: "function", function: { name: "web_search", arguments: JSON.stringify({ query: "arova" }) } }],
              },
              finish_reason: "tool_calls",
            }],
            usage: { prompt_tokens: 90, completion_tokens: 6 },
          };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
    });
    return;
  }
  if (request.method === "GET" && url.pathname === "/search") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      results: [{ title: "Arova docs", url: "https://example.com/arova", content: "Arova is a workspace for named agents." }],
    }));
    return;
  }
  response.writeHead(404, { "content-type": "text/plain" });
  response.end("not found");
});
server.listen(PORT, "127.0.0.1", () => console.log(`fixture on http://127.0.0.1:${PORT}`));
