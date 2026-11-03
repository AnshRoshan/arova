# Session handoff

Current state (2026-11-03): **spec 26 is closed.** `board/route.ts` is 87 lines — authenticate,
parse, dispatch. The chat reply path lives in `src/lib/chat-runner.ts`, the org brief in
`src/lib/brief-runner.ts` (now imported by `/api/trigger` and `/api/channels/[token]` directly, so
no route imports another route), the action chain in `src/lib/board-actions.ts`, the payload in
`src/lib/board-payload.ts`, and the shared helpers (postToChannel, memory recall, quota/timeout
config, `cookieName`) in `src/lib/board-core.ts`. No structural item is open; the remaining
blockers are all credential/owner ones.

## What this session did

Spec 26's third slice, code moved verbatim (no behaviour change intended or observed):
route 1,876 → 87 lines; four new modules + board-core extensions. Repointed three cross-route
imports (`runBrief` ×2, `cookieName`).

## Verification

`npm test` **284/284**, `tsc --noEmit` ✓, `npm run build` ✓ (11 routes). Live on :3100:
API sweep **35/35**; `cancel-proof.mjs` end-to-end on the real `wsl` provider (mid-flight cancel,
late result refused, CANCELLED row survives). `run-contract-proof.mjs` passes the catch-up checks;
its "Calling the model" step check cannot pass on a host with no configured provider —
`executeRoutine` refuses before that step (pre-existing code, untouched).

## Traps (all still hold)

- No model key is configured; chat/eval/brief paths say so honestly. Root OpenDots Phase 1
  (E2B measurements) still precedes any desktop work.
- Start dev with `env -u OPENAI_API_KEY node scripts/dev.mjs -p 3100`; the script forwards args
  **without** `--` (`-- -p 3100` becomes a directory argument and Next refuses to boot).
- Stopping a dev server from a task runner kills the wrapper only: read the pid from
  `.next/dev/lock` (or `netstat -ano | grep :3100`) and `taskkill /PID <pid> /T /F`, then
  `git checkout next-env.d.ts` (dev rewrites it to `.next/dev/types`).
- `cancel-proof.mjs` needs `AROVA_SANDBOX_PROVIDER=wsl` on the server process; the plain sweep
  does not.
- curl on this host dies on schannel CRL; use node fetch. `npm run lint` stays out of the gate.
- Arova's name is crowded (feature-parity §6.6); root D-26 still blocks any public push.

## NEXT STEP (the one thing to do)

Nothing structural is open in Arova. The next work is either (a) the owner's unblocks — a model
key, the OAuth client, the D-26/D-30 name decisions, root Phase 1 E2B measurements — or (b) a
finish review of this refactor in a fresh context, then push decision. S-1 (append-only run
journal) still waits on the owner accepting a second transcript.

## Open with the user

1. **Push?** All commits are local on `main`; nothing has been pushed to `origin`.
2. **Model key** for live evals, briefs and the tool loop against a real provider.
3. **Root decisions** D-26 (OpenDots name) and D-30 (self-host vs hosted).
4. **Channel target encryption** before any public deployment.
