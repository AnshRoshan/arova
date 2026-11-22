/**
 * A scripted Slack Web API for live verification (spec 21b). `npm run mock-slack`.
 * Records every chat.postMessage call so the test can assert the acknowledgement/report reached
 * the right channel and thread. Serves POST /api/* — point SLACK_API_BASE at it.
 */
const http = require("node:http");

const posted = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.url === "/_posted") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ posted }));
    }
    let payload = {};
    try { payload = JSON.parse(body || "{}"); } catch { /* answered as an error below */ }
    if (req.url === "/api/chat.postMessage") {
      posted.push({ channel: payload.channel, thread_ts: payload.thread_ts ?? null, text: payload.text, auth: req.headers.authorization });
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, ts: `${Date.now()}.0001` }));
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "unknown endpoint" }));
  });
});

server.listen(3103, "127.0.0.1", () => console.log("mock slack on http://127.0.0.1:3103/api"));
