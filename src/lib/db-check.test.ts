import { test } from "node:test";
import assert from "node:assert/strict";
import { AROVA_TABLES, classifyTables, missingArovaTables } from "./db-check.ts";

/**
 * Spec 25b: before any `drizzle-kit push`, the target database must be proven ours.
 * `empty` = no public tables; `arova-only` = every existing table is one Arova owns;
 * `foreign` = anything else. `foreign` must refuse the push; the classifier is the
 * decision, and this file is where its meaning is pinned.
 */

test("the expected table list is exactly the 19 tables specs 01–17 create", () => {
  assert.deepEqual([...AROVA_TABLES].sort(), [
    "agents", "approvals", "connections", "credentials", "delegations", "events", "jobs",
    "memories", "messages", "model_usage", "routines", "run_steps", "runs", "sandboxes",
    "teams", "tool_calls", "triggers", "worker_heartbeats", "workspaces",
  ]);
});

test("no public tables is empty", () => {
  assert.equal(classifyTables([]), "empty");
});

test("every table on the Arova list is arova-only — all 15 or a pushed subset", () => {
  assert.equal(classifyTables([...AROVA_TABLES]), "arova-only");
  assert.equal(classifyTables(["workspaces", "agents"]), "arova-only");
  assert.equal(classifyTables(["workspaces"]), "arova-only");
});

test("any table outside the list is foreign — even one, even alongside Arova tables", () => {
  assert.equal(classifyTables(["app_users"]), "foreign");
  assert.equal(classifyTables([...AROVA_TABLES, "app_db_leftovers"]), "foreign");
});

test("the check is exact: a lookalike name is foreign, not a fuzzy match", () => {
  assert.equal(classifyTables(["workspace"]), "foreign");
  assert.equal(classifyTables(["workspaces "]), "foreign");
});

test("missingArovaTables names what a partial push has not created yet", () => {
  assert.deepEqual(missingArovaTables([]), [...AROVA_TABLES]);
  assert.deepEqual(missingArovaTables(["workspaces", "agents", "messages"]), [
    "teams", "routines", "runs", "run_steps", "approvals", "connections",
    "sandboxes", "events", "model_usage", "delegations", "memories", "triggers",
    "jobs", "worker_heartbeats", "tool_calls", "credentials",
  ]);
  assert.deepEqual(missingArovaTables([...AROVA_TABLES]), []);
});

test("missingArovaTables ignores foreign tables — the refusal names them separately", () => {
  assert.deepEqual(missingArovaTables(["app_users"]), [...AROVA_TABLES]);
});
