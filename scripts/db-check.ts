/**
 * Spec 39b — `npm run db:check`. Connects with DATABASE_URL, proves the target is a
 * database this project owns, and exits non-zero on `foreign`. Read-only: it runs
 * SELECTs only — no DROP, no ALTER, no push, no `--force`.
 *
 * The decision lives in src/lib/db-check.ts so the boundary stays unit-tested.
 */
import { config as loadEnv } from "dotenv";
import { Pool } from "pg";
import { AROVA_TABLES, classifyTables, missingArovaTables } from "../src/lib/db-check.ts";

// Next.js loads .env.local over .env for the app; drizzle-kit and this script run
// outside Next, so the same precedence is mirrored here. Values are never printed.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("db:check — no DATABASE_URL found.");
  console.error("Set it in .env.local for a database this project owns before running this check.");
  process.exit(2);
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });

try {
  const info = await pool.query<{ database: string; version: string }>(
    "select current_database() as database, version() as version",
  );
  const tables = await pool.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name`,
  );
  const names = tables.rows.map((row) => row.table_name);
  const ownership = classifyTables(names);
  const missing = missingArovaTables(names);

  console.log(`db:check — database: ${info.rows[0].database}`);
  console.log(`db:check — server: ${info.rows[0].version.split(" ").slice(0, 2).join(" ")}`);
  console.log(`db:check — public tables (${names.length}): ${names.join(", ") || "(none)"}`);

  if (ownership === "empty") {
    console.log("db:check — EMPTY: no public tables. A push creates Arova's schema.");
  } else if (ownership === "arova-only") {
    console.log(`db:check — AROVA-ONLY: every table is Arova's${missing.length ? ` (missing: ${missing.join(", ")})` : " (schema complete)"}.`);
  } else {
    const foreign = names.filter((name) => !(AROVA_TABLES as readonly string[]).includes(name));
    console.error(`db:check — FOREIGN: table(s) Arova does not own: ${foreign.join(", ")}.`);
    console.error("db:check — refusing. Point DATABASE_URL at a database this project owns; never push here.");
    process.exit(1);
  }
} catch (error) {
  console.error(`db:check — could not reach the database: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
} finally {
  await pool.end();
}
