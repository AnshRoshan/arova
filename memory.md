# Session handoff

Current state (2026-10-28): **market brief rev 2 plus the no-credential product slice are built and
verified.** Channels (generic HTTPS webhook + inbound org token + delivery ledger), the eval harness
(substring score, honest `SKIPPED`/`ERROR`) and the agent registry (exact SQL aggregates) are live in
the app. The market research is now thirteen products/agents with pricing, reliability, demand,
substitutes, positioning and kill criteria. **Committed on `main` as `c7ecb3d` (design), `58c07dc`
(product), `59a18dc` (docs); not pushed.**

## What changed

- `context/feature-parity.md` is now **Market brief — rev 2** (filename kept for historical links):
  source tiers A/B/C, dated rows, pricing band, OSWorld 1.0/2.0 and WebVoyager evidence, McKinsey /
  LangChain demand, substitutes, self-host-first positioning (D-19), a 12-column matrix, gap ranking
  and a refresh checklist.
- **Channels** (spec 16, D-20): `channels` + `channel_deliveries`; `src/lib/channels.ts` (SSRF-checked
  delivery, target redaction, Slack/generic payloads, 8 s timeout); create/update/delete/test actions;
  `notifyChannels` on routine finish, brief finish and approval request; `POST/GET
  /api/channels/[token]` with a per-row token and 60 s atomic cooldown, reusing `runBrief`.
- **Evals** (spec 17, D-21): `eval_tasks` + `eval_results`; `src/lib/evals.ts`; create/delete/run
  actions; each attempt is a real run + step; pass rate excludes `SKIPPED`/`ERROR`, empty suite = null.
- **Registry** (spec 18, D-22): `src/lib/registry.ts`; board `registry` field; exact SQL counts for
  last run/status, run count, pending approvals and enabled routines; Settings → Agent registry.
- **Docs corrected:** README lists the eleven live tools (not "four") and the new surfaces; PRODUCT.md
  no longer says the worker is deliberately not working; D-19–D-22 appended.

## Verification

- `npm test` **208/208** (17 new), `npx next typegen` ✓, `tsc --noEmit` ✓, `npm run build` ✓,
  `GET /api/health` ✓. Dev server on :3000.
- Live: webhook test to `https://httpbin.org/post` → **DELIVERED**; to `https://example.com/hook` →
  **FAILED: example.com answered 405** (both ledger rows); inbound org channel → local-provider lead
  failed honestly, second immediate call **429**; eval with no model key → **SKIPPED** with a real
  `Eval · Says READY` run; registry counts matched the stored runs.
- UI: Integrations → Channels, Automations → Evals and Settings → Agent registry verified with real
  rows via the chrome-devtools DOM snapshot. No screenshots saved (the MCP surface does not save them).
- **Improvement batch 2 (2026-10-28):** `GET /api/export` (spec 20, D-24) returns a sanitized audit JSON
  (200 with attachment header; no message bodies/targets/tokens; no cookie → 401). Sandbox output is
  capped at 20k, Reset deletes only the per-agent workspace (runs/audit stay), and the Sandbox tab shows
  workspace state + recent runs. Channels retry network/5xx twice and never retry a 4xx. **219/219 tests**;
  live reset left the `Sandbox · Scout` FAILED run intact.

## The DB fact

`arova_demo` **did not exist** on the shared PostgreSQL server and the app was configured for it. It
was created and `drizzle-kit push` applied the new tables. `app_db` belongs to another project and was
not touched. The schema change is additive.

## Local OS sandbox (implemented 2026-10-28)

`@anthropic-ai/sandbox-runtime@0.0.81` is a **runtime dependency** (Apache-2.0, Node ≥22.12).
`src/lib/sandbox.ts` has `UnconfiguredSandboxProvider` (default, refuses) and `LocalOsSandboxProvider`
(`AROVA_SANDBOX_PROVIDER=local-os`), with `{graphical:false, pty:true, snapshots:false,
takeover:false, persistentHome:true, multiScreen:false}`. It writes a per-agent `srt-settings.json`,
runs the packaged CLI through `process.execPath`, denies `.env`/credentials, and starts with an empty
network allowlist. `runSandboxCommand` is a real run + step + audit; the UI is Integrations → Sandbox.
Spec 19, D-23.

On this Windows host the provider **fails closed** until the owner runs `npx srt windows-install`
(one UAC; creates `srt-sandbox` + WFP). Live: Check produced a `Sandbox · Scout` FAILED run, an ERROR
`sandboxes` row, and the exact REFUSED sentence. A successful command is **not** verified yet. The
direct WSL2 `bubblewrap` primitive passed (workspace write, network blocked, root read-only, `/etc`
blocked). Srt-specific checks (empty-allowlist regression, metadata/loopback, concurrency, Chromium)
remain. The spike script is `.impeccable/srt-spike.mjs`; root D-27 option (e), TASKS 1.9, A-10. The
package adds a high `zod` advisory; the project's critical advisory is pre-existing Next 16.2.6, not
the sandbox package.

## Read-only tool loop (2026-10-28)

The model can now call the seat's granted read-only tools when `Capabilities.toolLoop` is on:
`calc`, `now_in_timezone`, `json_transform`, `checksum`, `web_fetch`, and `web_search` when a search
provider is configured and `web_fetch` is granted. `src/lib/tool-loop.ts` is pure and bounded at 4
steps; `src/lib/web-search.ts` supports SearXNG/Brave/custom with a local-endpoint guard. The final
answer is non-streamed and carries `toolsUsed`/`sources`; every tool call is a `tool.called` event.
The UI has the per-agent toggle, a live tool card and a Sources line. **Spec 21, D-25.**

Live proof without a vendor key: `.impeccable/tool-loop-fixture.mjs` (local OpenAI-compatible model +
search). The SSE produced tool running/completed, a delta with `[1]`, stored sources, audit, and two
counted calls; the UI showed the answer and Sources link. The default environment still has no model
key; a real vendor/search endpoint is unverified. **232/232 tests.**

## Traps

- **No model key is configured.** `.env.local` has a `dahl` profile but no key, so chat/eval/notification
  model paths honestly say `SKIPPED`/`not configured`. A live eval `PASS`/`FAIL` has not been exercised.
- **Outbound HTTPS works through Node fetch, not curl.** example.com answers 405 to POST; httpbin.org
  works. curl on this host dies on schannel CRL revocation; use `node` fetch or the app.
- **A channel target is a credential.** It is stored server-side and only the hostname is sent to the
  browser. There is no at-rest encryption in this build; say so.
- **Inbound is a brief, not a generic write.** It reaches one org's lead through `runBrief`, with the
  same budget and refusal sentences; workspace-wide channels are outbound only.
- **The root OpenDots Phase 1 still precedes any sandbox work.** Do not implement E2B/desktop before
  the resume/login measurements. Search needs a tool-calling loop, not just a search key.
- **The name is crowded.** Arova collides with Arova Nexus (enterprise IT-ops AI), Arova Technologies
  and an AROVA DeFi agent; legal/search check before a public launch.
- **Operational notes that still hold:** start dev with `env -u OPENAI_API_KEY npm run dev` (an
  ambient key would outrank `.env.local`); a running Next dev server can serve stale bundles — read
  `.next/dev/lock` for the pid, `taskkill /PID x /F`, restart; `.impeccable/cdp-harness.cjs` and
  `cdp-channel.cjs` are the raw-CDP drivers; the dahl endpoint returns byte-identical replies for a
  repeated prompt; `npm run lint` still has pre-existing advisory errors outside the gate.

## NEXT STEP (the one thing to do)

**Provision srt on this host:** run `npx srt windows-install` (one UAC prompt; on a shared machine
use `--skip-profile-grant`), restart the dev server, then Integrations → Sandbox → Check. A passing
check should show `arova-sandbox-ok`. Then run `node .impeccable/srt-spike.mjs` for the eight policy
checks (empty allowlist, metadata/loopback, filesystem, concurrency, Chromium). If Windows is not the
target, install Node ≥22.12 + `socat` in WSL2 and run the spike there. The other pending evidence is
a live eval with a configured model key.

## Open with the user

1. **Push?** The three commits are local on `main`; nothing has been pushed to `origin`.
2. **Model key** for the live eval and real channel notification.
3. **D-19 vs root D-30** — self-host first is the working answer; the owner may still choose hosted.
4. **Name** — Arova is crowded; legal/search check before publishing.
5. **Channel target storage** — encrypt at rest / secret manager before a public deployment.

## Session 2026-10-28 (later) — Feature 22, the citation ledger
Reading the tool loop for the session's next improvement found a defect, not a wish: every `web_search` numbered its own results from `[1]` while the UI re-numbered the deduped source list from `[1]` again, so a second search made every citation name a page the model had not read. `web_fetch` returned no source at all, and an invented number rendered exactly like a real one.

**Built, test-first.** `src/lib/citations.ts` (7 tests, RED first): `createLedger` / `addSource` (one stable number per unique URL, fragment-stripped, cap 12 — past the cap a source is never numbered) and `citationReport` → `{cited, unresolved, uncited}`, ignoring `[0]` and numbers inside code spans/fences. `executeToolCall` now takes the ledger, so search text and the source list share numbering; `web_fetch` returns its final URL and title, and its output is prefixed with its number. `ToolLoopResult` carries `sources[{index,title,url}]` and `citations`; the report runs on `splitReasoning(content).answer`. Both reply paths store it through one `toolLoopMetadata()` helper. The UI prints each source's own index and a waiting-coloured line for invented citations. The system prompt now says numbers are fixed for the whole reply.

**Verified.** 241/241 tests, `next typegen`, `tsc`, `npm run build` green. Live against `.impeccable/tool-loop-fixture.mjs` (rewritten to do two searches — the second repeats a URL — and answer citing [1], [3] and inventing [9]): stored `sources` indices `[1,2,3]` in discovery order, `citations {cited:[1,3],unresolved:[9],uncited:[2]}`, two `tool.called` audits, report survives reload (`.impeccable/citation-proof.mjs`). Real Chrome at 1440×900 and 390×844: `Sources: [1] Arova docs · [2] Arova notes · [3] Arova pricing`, the [9] warning in `rgb(232,178,92)`, `CONSOLE: []`, no overflow (`.impeccable/cdp-citations.mjs`).

**Not verified.** A real search provider and vendor model (no key), unchanged. No schema change; rows stored before this fall back to list position.

**Uncommitted.** Everything above is in the working tree; HEAD is still `3698c21`.

NEXT STEP (the one thing to do): a finish review in a fresh context, then commit (the last explicit request was "commit these changes" for the previous batch; this batch is new).

## Session 2026-10-28 (evening) — Feature 23, Stop actually stops
The Stop button aborted only the browser's read; the tool loop checked nothing between turns, kept buying model turns and tool calls, and then stored a complete answer the reader had cancelled. Nothing recorded that a stop happened.

**Built.** `streamReply` owns one `AbortController`; both `cancel()` and `request.signal` call `leave()` (marks closed, aborts). The router and each tool-loop turn get the signal; `requestCompletion` combines it with the timeout and **never retries an abort** (one attempt, then the caller's error). `runToolLoop` polls `shouldStop` before each turn/call — a tool already running finishes, nothing new starts — and returns `stopped`. A stopped loop writes **no assistant row and no provider-error row**, only `chat.stopped` ("Stopped by the reader before the tool loop finished; no answer was stored"). Token-streamed replies are unchanged and still keep their partial.

**Verified.** New tests: one model turn after a stop (+ running tool kept), one fetch attempt after an abort. Live fixture (loop turn delayed 1.2 s, `/stats` counts): reader aborts on the first `tool` event → `{calls:3, delayed:1, aborted:1}`, no delta, only the greeting stored, one stop audit (`.impeccable/stop-proof.mjs`). 243 tests, typegen/tsc/build green. Spec 23, D-27.

**Out of scope, named:** `runBrief` still only polls `isClosed` between steps (a brief reader who leaves keeps the brief running); consult/handoff streams are not aborted.

HEAD after the citation commit is `9c6fb91`; this feature is uncommitted as of this entry (committed in the same turn if the gate passed).

### Same session, continued — briefs stop too (D-28)
D-27 covered chat; an org brief still only polled `isClosed` between steps, so a reader who left kept paying for the router and every seat call and the report was written afterwards. `streamBrief` now owns the same controller (cancel + `request.signal`), `runBrief` polls `stopped()` before the first summons, each routing pass, each seat call and the report, and the signal reaches `routeDecision` and `consultPeer` recursively. A stopped brief writes one `channel_gap` row with `metadata.stopped`, audits `brief.stopped`, finishes `CANCELLED`, and writes no "did not answer" gap and no `provider_error`; posts already landed stay. `streamText` moved to the gateway as `readSseText`, which calls `reader.cancel()` on stop — partial text kept, provider connection closed.

Verified 244/244 tests; live brief proof `{calls:2, delayed:1, aborted:1}` + stop row + CANCELLED run + one audit (`.impeccable/brief-stop-proof.mjs`); both earlier live proofs re-run. The local fix queue is now empty; remaining blockers are credential/infrastructure ones (OAuth client, sandbox provisioning, vendor/search keys, pgvector).

**Also fixed:** the client's Stop toast promised a stored partial for a tool loop, which stores nothing. It now picks the message from what happened (stored partial / streamed-but-landing / nothing streamed) and was verified through the real composer in Chrome (`.impeccable/cdp-stop-toast.mjs`). Uncommitted until the gate passes.

**Sweep fixes (D-29):** history paging now uses `(created_at, id)` — 250 tied rows reproduced the old 0-row page, the pair cursor returned 50 with no overlap (`paging-proof.mjs`, needs the app's DATABASE_URL from `.env.local`, never printed). The search adapter refuses non-local http so a key cannot ride plain http.
