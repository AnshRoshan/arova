import { test } from "node:test";
import assert from "node:assert/strict";
import { AROVA_TABLES, classifyTables, missingArovaTables } from "./db-check.ts";

/**
 * Spec 25b: before any `drizzle-kit push`, the target database must be proven ours.
 * `empty` = no public tables; `arova-only` = every existing table is one Arova owns;
 * `foreign` = anything else. `foreign` must refuse the push; the classifier is the
 * decision, and this file is where its meaning is pinned.
 */

test("the expected table list is exactly the 41 tables the union schema creates (main 01–29 + ported 30–41)", () => {
  assert.deepEqual([...AROVA_TABLES].sort(), [
    "agent_versions", "agents", "approvals", "attention_items", "channel_connections", "channel_deliveries", "channel_events",
    "channels", "connections", "credentials", "delegations", "eval_results", "eval_suites",
    "eval_tasks", "events", "external_effects", "goals", "jobs", "memberships", "memories",
    "messages", "model_usage", "research_findings", "research_projects", "research_sources",
    "routines", "run_steps", "runs", "sandboxes", "scheduler_heartbeats", "sessions",
    "skill_versions", "skills", "teams", "tool_calls", "triggers", "users", "watches",
    "worker_heartbeats", "workspaces",
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
  assert.deepEqual(missingArovaTables(["workspaces", "agents", "messages"]), [...AROVA_TABLES].filter(t => !["workspaces", "agents", "messages"].includes(t)));
  assert.deepEqual(missingArovaTables([...AROVA_TABLES]), []);
});

test("missingArovaTables ignores foreign tables — the refusal names them separately", () => {
  assert.deepEqual(missingArovaTables(["app_users"]), [...AROVA_TABLES]);
});
