import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRegistry, searchRegistry, type RegistryStats } from "./registry.ts";

const agents = [
  { id: "a1", name: "Scout", role: "Researcher", status: "ACTIVE", teamId: "t1", managerId: null, provider: "auto", capabilities: { tools: ["calc", "web_fetch"], permissionMode: "default" } },
  { id: "a2", name: "Meridian", role: "Lead", status: "ACTIVE", teamId: "t1", managerId: null, provider: "dahl", capabilities: { tools: [], permissionMode: "plan" } },
  { id: "a3", name: "Bench", role: "Writer", status: "PAUSED", teamId: null, managerId: null, provider: "local", capabilities: null },
];
const teams = [{ id: "t1", name: "Studio" }];
const stats = new Map<string, RegistryStats>([
  ["a1", { lastRunAt: "2026-10-22T10:00:00.000Z", lastRunStatus: "FAILED", runCount: 2, pendingApprovals: 1, routineCount: 1 }],
  ["a2", { lastRunAt: "2026-10-21T10:00:00.000Z", lastRunStatus: "COMPLETED", runCount: 1, pendingApprovals: 1, routineCount: 0 }],
]);

test("the registry reports exact last run, counts and pending decisions", () => {
  const scout = buildRegistry(agents, teams, stats).find(r => r.id === "a1")!;
  assert.equal(scout.teamName, "Studio");
  assert.equal(scout.tools, 2);
  assert.equal(scout.lastRunStatus, "FAILED");
  assert.equal(scout.lastRunAt, "2026-10-22T10:00:00.000Z");
  assert.equal(scout.runCount, 2);
  assert.equal(scout.pendingApprovals, 1);
  assert.equal(scout.routineCount, 1);
});

test("an agent with no stats says zero/null rather than inventing a time", () => {
  const bench = buildRegistry(agents, teams, stats).find(r => r.id === "a3")!;
  assert.equal(bench.lastRunAt, null);
  assert.equal(bench.runCount, 0);
  assert.equal(bench.permissionMode, "default");
  assert.equal(bench.tools, 0);
});

test("active seats sort before paused ones, then by name", () => {
  assert.deepEqual(buildRegistry(agents, teams, stats).map(r => r.name), ["Meridian", "Scout", "Bench"]);
});

test("search covers name, role, team, status and provider", () => {
  const rows = buildRegistry(agents, teams, stats);
  assert.deepEqual(searchRegistry(rows, "studio").map(r => r.name), ["Meridian", "Scout"]);
  assert.deepEqual(searchRegistry(rows, "paused").map(r => r.name), ["Bench"]);
  assert.deepEqual(searchRegistry(rows, "dahl").map(r => r.name), ["Meridian"]);
  assert.equal(searchRegistry(rows, "").length, 3);
});
