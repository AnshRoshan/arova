/**
 * A scripted OpenAI-compatible model for live verification (spec 17 step 2). `npm run mock-model`.
 * Behaviour: the router always says "none"; a chat whose last user message names a URL returns the
 * web_fetch tool directive; a chat containing a TOOL RESULT answers from it. Unary and SSE both
 * supported so both reply paths can be driven.
 */
const http = require("node:http");

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let payload = {};
    try { payload = JSON.parse(body || "{}"); } catch { /* treated as empty */ }
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const isRouter = messages.some((m) => String(m.content || "").startsWith("You are a router"));
    const toolResult = messages.find((m) => String(m.content || "").startsWith("TOOL RESULT"));
    let content;
    if (isRouter) {
      content = JSON.stringify({ action: "none" });
    } else if (toolResult) {
      content = `Based on the fetched page: ${String(toolResult.content).slice(60, 200)} The tool ran on the server and this answer uses only what it returned.`;
    } else {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const ask = String((lastUser && lastUser.content) || "");
      if (/set .*status/i.test(ask)) content = JSON.stringify({ tool: { name: "mcp:ops:set_status", arguments: { status: "degraded" } } });
      else if (/status/i.test(ask)) content = JSON.stringify({ tool: { name: "mcp:ops:get_status", arguments: {} } });
      else {
        const url = ask.match(/https?:\/\/[^\s"']+/);
        if (url) content = JSON.stringify({ tool: { name: "web_fetch", arguments: { url: url[0] } } });
        else content = `Here is my answer to "${ask.slice(0, 80)}". I have no tool to run for this, so this is the direct reply the server should record.`;
      }
    }
    const finish = { id: "mock-1", object: "chat.completion", created: 0, model: payload.model || "mock-1", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 34 } };
    if (payload.stream) {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      for (let i = 0; i < content.length; i += 24) {
        res.write(`data: ${JSON.stringify({ ...finish, choices: [{ index: 0, delta: { content: content.slice(i, i + 24) }, finish_reason: null }] })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ id: "mock-1", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: finish.usage })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(finish));
    }
  });
});

server.listen(3101, "127.0.0.1", () => console.log("mock model on http://127.0.0.1:3101/v1"));
