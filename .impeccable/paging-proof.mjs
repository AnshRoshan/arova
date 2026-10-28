/**
 * Proves the history cursor survives tied timestamps. 250 messages inserted in one statement share
 * `created_at`; a timestamp-only cursor would page past all of them (0 rows) and silently truncate
 * the thread. The (createdAt, id) cursor returns the other 50 and no duplicates.
 *
 * Uses the app's own DATABASE_URL from .env.local (never printed) only to create the tie fixture
 * and remove the throwaway workspace afterwards.
 *
 *   npm run dev
 *   node .impeccable/paging-proof.mjs
 */
import assert from "node:assert/strict";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
const BASE = process.env.AROVA_BASE ?? "http://localhost:3000";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const init = await fetch(`${BASE}/api/board`);
const cookie = (init.headers.get("set-cookie") ?? "").split(";")[0];
assert.ok(cookie, "a workspace cookie is required");
const workspace = cookie.split("=")[1];
const headers = { cookie, "content-type": "application/json" };
const act = async (action, payload) => {
  const response = await fetch(`${BASE}/api/board`, { method: "POST", headers, body: JSON.stringify({ action, ...payload }) });
  const body = await response.json().catch(() => ({}));
  assert.equal(response.status, 200, `${action} -> ${response.status} ${body.error ?? ""}`);
  return body;
};
const board = () => fetch(`${BASE}/api/board`, { headers: { cookie } }).then(response => response.json());

let agentId = null;
try {
  const created = await act("createAgent", { name: "Pager", role: "researcher" });
  agentId = created.agent?.id ?? created.agentId;
  assert.ok(agentId, "the agent was created");
  // The greeting is not part of the fixture, so the count is exactly the ties.
  await pool.query("delete from messages where agent_id = $1", [agentId]);
  await pool.query(
    `insert into messages (workspace_id, agent_id, role, content, created_at)
     select $1, $2, 'user', 'tie ' || g, '2026-01-01T00:00:00Z'::timestamptz from generate_series(1, 250) g`,
    [workspace, agentId],
  );

  const first = await board();
  assert.equal(first.messages.length, 200, "the window still loads exactly 200");
  assert.equal(first.olderMessages, true, "there is more history");

  const oldest = first.messages.reduce((min, message) =>
    !min || message.createdAt < min.createdAt || (message.createdAt === min.createdAt && message.id < min.id) ? message : min, null);
  assert.ok(oldest, "the oldest loaded row has a cursor");

  const tied = await act("loadEarlier", { before: oldest.createdAt });
  assert.equal(tied.earlier.length, 0, "without the id a tied timestamp has no rows before it — the old bug");

  const page = await act("loadEarlier", { before: oldest.createdAt, beforeId: oldest.id });
  assert.equal(page.earlier.length, 50, "the id breaks the tie and the last 50 arrive");

  const seen = new Set(first.messages.map(message => message.id));
  const overlaps = page.earlier.filter(message => seen.has(message.id));
  assert.deepEqual(overlaps, [], "no row is delivered twice");
  const union = new Set([...seen, ...page.earlier.map(message => message.id)]);
  assert.equal(union.size, 250, "every message is reachable, none skipped");

  console.log(JSON.stringify({
    workspace,
    window: first.messages.length,
    olderPage: page.earlier.length,
    union: union.size,
    tiedWithoutId: tied.earlier.length,
  }, null, 2));
  console.log("PASS history paging survives tied timestamps");
} finally {
  await pool.query("delete from workspaces where id = $1", [workspace]).catch(() => {});
  await pool.end();
}
