import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js loads .env.local over .env for the app; drizzle-kit runs outside Next, so
// the same precedence is mirrored here. Values are never printed.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

// Spec 25c: no guessed fallback. A push is destructive; it may only run against a
// database this project owns, named by DATABASE_URL (verify it first: `npm run db:check`).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "Set DATABASE_URL for a database this project owns before running drizzle-kit (see context/feature-specs/25-local-development-bootstrap.md).",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: databaseUrl,
  },
});
