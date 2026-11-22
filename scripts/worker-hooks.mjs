/** Preload for the worker process (`npm run worker`): loads .env.local over .env BEFORE any app
 * module evaluates (ESM import hoisting means src/worker/index.ts's own loadEnv call would run
 * too late — `@/db` throws at import time otherwise), then registers the `@/` alias resolver. */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
import { register } from "node:module";
register(new URL("./worker-loader.mjs", import.meta.url));
