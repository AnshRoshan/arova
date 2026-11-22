/**
 * Spec 39b — the ownership gate that runs before any `drizzle-kit push`.
 * The classifier decides; the script in scripts/db-check.ts only connects, prints
 * and exits. Neither ever mutates the database.
 */

/** The public-schema tables Arova's schema creates (src/db/schema.ts), specs 01–41 (main 01–29, ported 30–41). */
export const AROVA_TABLES = [
  "workspaces",
  "teams",
  "agents",
  "messages",
  "routines",
  "runs",
  "run_steps",
  "approvals",
  "connections",
  "sandboxes",
  "events",
  "model_usage",
  "delegations",
  "memories",
  "triggers",
  "jobs",
  "worker_heartbeats",
  "tool_calls",
  "credentials",
] as const;

export type Ownership = "empty" | "arova-only" | "foreign";

/**
 * `empty` — no public tables, a push creates the schema.
 * `arova-only` — every table present is one Arova owns (a partial or full push).
 * `foreign` — at least one table Arova does not own; a push must refuse.
 */
export function classifyTables(tables: string[]): Ownership {
  if (tables.length === 0) return "empty";
  const known = AROVA_TABLES as readonly string[];
  return tables.every((table) => known.includes(table)) ? "arova-only" : "foreign";
}

/** Which of Arova's expected tables a database does not have yet — names a partial push. */
export function missingArovaTables(tables: string[]): string[] {
  const present = new Set(tables);
  return (AROVA_TABLES as readonly string[]).filter((table) => !present.has(table));
}
