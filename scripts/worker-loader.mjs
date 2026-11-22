/**
 * Spec 16b — the worker runs as a plain Node process outside Next, where the app's `@/...`
 * tsconfig alias does not exist. This resolve hook maps `@/x` onto `<repo>/src/x`, adding the
 * `.ts` extension Node's ESM resolver requires. No dependency; registered by worker-hooks.mjs.
 */
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = new URL("../src/", import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = new URL(specifier.slice(2), src);
    for (const suffix of ["", ".ts", ".tsx", "/index.ts"]) {
      try {
        const candidate = new URL(`${base.href}${suffix}`);
        if (statSync(fileURLToPath(candidate)).isFile()) return next(candidate.href, context);
      } catch {
        // no such file — try the next candidate shape
      }
    }
  }
  // Outside a Next build, `next/server` resolves only through the package's root shim
  // (`next/server.js`); the bare specifier fails in plain Node.
  if (specifier === "next/server" || specifier === "next/headers") {
    return next(`${specifier}.js`, context);
  }
  return next(specifier, context);
}
