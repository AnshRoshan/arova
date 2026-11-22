# Code standards

## Language and boundaries
- TypeScript everywhere; no `any` in new code unless it is an explicit boundary cast with a comment.
- Zod parses every API action body. Unknown actions fail; no action trusts a client-provided workspace id.
- Drizzle is the only database access layer. No raw SQL unless a documented Postgres feature requires it (the memory GIN index is the current exception).
- Server-only values (keys, base URLs) never cross into client props or JSON. Profiles sent to the browser are `{name, label, model, configured, maxContextTokens}` only.
- Workspace-scope every read and write. `ownedAgent` / `ownedRoutine` style guards are required before a mutation.
- API failures are honest: return the upstream status and a sentence, persist a diagnostic, never invent a model answer.

## File and naming conventions
- kebab-case files; PascalCase React components; camelCase functions/variables; SCREAMING_SNAKE env vars.
- Domain rules live in `src/lib/*.ts` with a matching `*.test.ts`. The client stays in `src/app/page.tsx`; route handlers stay thin enough to read.
- New route = new `src/app/api/<name>/route.ts`. Do not add a second general mutation endpoint while `/api/board` owns the product.
- Prefer extending an existing action or helper over a parallel implementation. Two reply paths share `planReply` and the same decision helpers.
- Env var names are derived from provider names (`ollama-local` → `OLLAMA_LOCAL_*`); never add a vendor-specific branch.

## Data and correctness
- Stored prose is never rewritten for display; format dates around it, not into it.
- Estimates are labelled `(est.)`; exact counts are not. Sample rows never count as real work.
- State is derived from stored rows or a received SSE frame. No optimistic success states.
- Pagination, retention, CSRF and rate limiting are known gaps; do not silently claim they exist.

## UI
- Read `DESIGN.md` plus `context/ui-tokens.md` and `context/ui-rules.md` before styling.
- No hardcoded hex in JSX; use tokens from `src/app/globals.css`. One accent; state colours only for real state.
- Model output goes through `src/lib/markdown.ts` into React nodes; never `dangerouslySetInnerHTML`.
- A control that does nothing must not render. Disabled surfaces explain why in place.
- Deletion confirms in-world, never `window.confirm()`.
- Verify UI in a browser at 1440×900 and 390×844 with a real stream when the change affects behavior.

## Tests
- Logic-bearing code ships its failing test first (RED-GREEN-REFACTOR).
- Tests live beside the module (`src/lib/foo.test.ts`) and use `node:test` + `node:assert/strict`; no test framework dependency.
- A bug fix ships a test that fails without the fix.
- Unit tests do not prove the app works; record what was driven live in the tracker.

## Safety
- Never read, edit or commit `.env*` values. `.env.example` is the only readable template.
- Never target a database this project does not own; `app_db` on this host belongs to another app.
- Never describe unconfigured OAuth, background execution, sandbox/tool execution or sample data as working.
- No demo data in `src/`; seed content belongs in `seed/` and must not be imported by the app.
