/**
 * Live proof for the citation ledger, against the local fixture (no vendor key).
 *
 *   node .impeccable/tool-loop-fixture.mjs
 *   PROVIDERS=fixture FIXTURE_BASE_URL=http://127.0.0.1:8788/v1 FIXTURE_MODEL=fixture \
 *   FIXTURE_API_KEY=test SEARCH_PROVIDER=custom SEARCH_BASE_URL=http://127.0.0.1:8788/search \
 *   SEARCH_ALLOW_LOCAL=1 npm run dev
 *   node .impeccable/citation-proof.mjs
 *
 * Asserts what the bug used to get wrong: the second search must not restart at [1], a repeated
 * URL keeps its number, and an invented [9] is reported rather than silently rendered as a source.
 */
import assert from "node:assert/strict";

const BASE = process.env.AROVA_BASE ?? "http://localhost:3000";
const init = await fetch(`${BASE}/api/board`);
const cookie = (init.headers.get("set-cookie") ?? "").split(";")[0];
assert.ok(cookie, "a workspace cookie is required");
const headers = { cookie, "content-type": "application/json" };
const act = async (action, payload) => {
  const response = await fetch(`${BASE}/api/board`, { method: "POST", headers, body: JSON.stringify({ action, ...payload }) });
  const body = await response.json().catch(() => ({}));
  assert.equal(response.status, 200, `${action} -> ${response.status} ${body.error ?? ""}`);
  return body;
};

const created = await act("createAgent", { name: "Citer", role: "researcher", capabilities: { toolLoop: true } });
const agentId = created.agent?.id ?? created.agentId;
assert.ok(agentId, "the agent was created");

const sent = await act("sendMessage", { agentId, stream: false, content: "Research Arova and cite every claim you make." });
const reply = sent.reply ?? {};
const metadata = reply.metadata ?? {};
const sources = Array.isArray(metadata.sources) ? metadata.sources : [];

assert.deepEqual(sources.map(source => source.index), [1, 2, 3], "three unique sources, numbered once across two searches");
assert.deepEqual(sources.map(source => source.url), ["https://example.com/a", "https://example.com/b", "https://example.com/c"], "the first search's pages keep the first numbers");
assert.deepEqual(metadata.citations, { cited: [1, 3], unresolved: [9], uncited: [2] }, "the invented [9] is reported, and B is honestly uncited");
assert.equal((metadata.toolsUsed ?? []).filter(name => name === "web_search").length, 2, "both searches ran");

const board = await (await fetch(`${BASE}/api/board`, { headers: { cookie } })).json();
const stored = board.messages.filter(message => message.agentId === agentId && message.role === "assistant").at(-1);
assert.deepEqual(stored?.metadata?.citations, metadata.citations, "the report survives a reload");
const audits = board.events.filter(event => event.agentId === agentId && event.type === "tool.called");
assert.equal(audits.length, 2, "each tool call is audited");

console.log(JSON.stringify({
  workspace: board.workspace.id,
  agentId,
  content: reply.content,
  sources,
  citations: metadata.citations,
  toolAudits: audits.length,
}, null, 2));
console.log("PASS citation ledger");
