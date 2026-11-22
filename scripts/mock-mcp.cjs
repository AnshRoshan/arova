/**
 * A scripted streamable-HTTP MCP server for live verification (spec 17c). `npm run mock-mcp`.
 * Tools: `get_status` (annotated read) and `set_status` (unannotated → the gateway's safe
 * default treats it as a write that pauses for approval). Stateless: every POST is answered
 * directly, no session id.
 */
const http = require("node:http");

const TOOLS = [
  { name: "get_status", description: "Read the current system status.", annotations: { readOnlyHint: true } },
  { name: "set_status", description: "Change the current system status." },
];

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let payload = {};
    try { payload = JSON.parse(body || "{}"); } catch { /* answered as a parse error below */ }
    const reply = (result) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id ?? 0, result }));
    };
    if (payload.method === "initialize") return reply({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "mock-ops", version: "1.0" } });
    if (payload.method === "tools/list") return reply({ tools: TOOLS });
    if (payload.method === "tools/call") {
      const name = payload.params?.name;
      const auth = req.headers.authorization || "none";
      if (name === "get_status") return reply({ content: [{ type: "text", text: `status: all systems nominal (mock-ops, 3 services up); auth seen: ${auth}` }] });
      if (name === "set_status") return reply({ content: [{ type: "text", text: "status set (mock would have written state)" }] });
      return reply({ content: [{ type: "text", text: `unknown tool ${name}` }] });
    }
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id ?? 0, error: { code: -32601, message: `no such method ${payload.method}` } }));
  });
});

server.listen(3102, "127.0.0.1", () => console.log("mock mcp on http://127.0.0.1:3102/mcp"));
