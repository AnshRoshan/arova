import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

/**
 * The pool is opened on the first query, never at import: `next build` evaluates every route module
 * with no environment, and a throw here would fail a build over a variable only a real request needs.
 */
const connect = () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool =
    globalForDb.__arenaNextJsPostgresqlPool ??
    new Pool({
      connectionString: databaseUrl,
    });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlPool = pool;
  }

  return drizzle(pool);
};

type Database = ReturnType<typeof connect>;

let instance: Database | undefined;

/**
 * One lazily built database per process, sharing the global pool in dev. Methods come back bound so a
 * destructured `const { select } = db` still runs against its own internals.
 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    instance ??= connect();
    const value = Reflect.get(instance as object, property) as unknown;
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
