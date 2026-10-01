# 14 — The OpenBot steals: provenance, fatigue, initiator (2026-10-01)

Source: `context/feature-parity.md` §7 — the three ideas worth stealing from CopilotKit's OpenBot,
chosen by "small, testable, no new dependency, no credentials". The user approved the direction and
the order (steals first, sign-in second — D-17). Three separate units, each with its failing test first.

## 14c — The standing provenance sentence (`src/lib/provenance.ts`)
- `PROVENANCE_LINE`: name where a claim came from, mark own-knowledge answers plainly, never present
  one as the other. Adopted from OpenBot's platform-wide block.
- `withProvenance(prompt)` appends it **last, exactly once, idempotently** — after seat instructions and
  skills — so seat text cannot argue it away and no newly created seat forgets it.
- Wired at every prompt site: `systemPrompt` (both returns, so chat, briefs and scheduled runs all carry
  it) and `buildPeerPrompt` (summons answer under the same rule).
- Tests: 4 in `provenance.test.ts`, including the hostile-instruction case.

## 14b — The fatigue rule (`src/lib/fatigue.ts`)
- `nextFatigue(status, prevStreak, prevEnabled)`: COMPLETED resets silently; **first** failure after a
  success posts one message; failures 2–9 are silent but count; **ten** consecutive switch the routine
  off with a final message and a `routine.fatigued` audit event. Deliberately not a retry policy —
  the expired-key-fires-cleanly-forever case, not the hiccup case.
- FLAGGED count decision (mine, reversible in one line): `WAITING_FOR_TOOL` counts as a failure to
  produce, because the daily-budget wait is exactly the every-night-silently-dead routine. If the user
  wants budget waits excluded, remove it from `FAILURE_STATES`.
- `routines.fail_streak` (default 0); `executeRoutine.finish` is the only place it is touched; a human
  resume (`toggleRoutine`) resets it — whoever fixed the key gets the full ten-failure silence again.
- The two thread messages say what they are: the count, the last summary, and that the routine will not
  fire until a person turns it back on.
- Tests: 5 in `fatigue.test.ts` (RED confirmed first — the loop initially pinned the wrong boundary at
  failure #10 and the failing test caught the author, which is the point of writing tests first).

## 14a — Initiator on every run (`runs.initiator`)
- `person | routine | trigger`, default `person`. Set at the three run-creation sites:
  `executeRoutine` → routine, `runBrief(…, "trigger")` from `/api/trigger` → trigger, everything else
  stays person. The Run rows list and the board Record section label it ("started by its schedule",
  "started by an inbound trigger"); a person's run carries no label, because it is the default truth.
- This is the **seam, not yet the policy**: OpenBot uses `initiator` so a rule can refuse unattended
  runs what it allows typers. Today no headless path reaches a write (memory saves are human clicks,
  distillation lands as proposals), so there is nothing honest to enforce yet — the column exists so
  the first real write-by-agent path must pass through a decision about it.

## Excluded on purpose
- The 20-enabled cap and 15-minute floor (our schedules are human-labeled, ≥1h by `parseSchedule`).
- Take-the-wheel (there is no browser to hand over). Deny-before-allow CEL (our boundary is spec 13's
  per-seat lists; a CEL engine is a different product).

## Verification
- 144/144 tests (was 135 + 9 new), typegen/tsc/build green, `drizzle-kit push` applied both columns to
  `arova_demo`, server on :3123: `/api/health` 200, fresh board payload read — 3 runs all carry
  `initiator` (`"person"`), 3 routines all carry `failStreak` (0).
- **Not driven live:** a real ten-failure streak and a trigger-fired `initiator:"trigger"` row. Both
  are one-line wiring over unit-proven functions; recorded as such rather than claimed.
