/** Registers the `@/` alias resolver for the worker process. Loaded via `--import` in npm run worker. */
import { register } from "node:module";
register(new URL("./worker-loader.mjs", import.meta.url));
