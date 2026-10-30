# Feature 25 — Boundary and honesty repairs

## The problem

A read of the tree on 2026-10-29 found behaviour that contradicts specs and
decisions already shipped. The list is `context/current-issues.md` C-1 through
C-19. None of these need a new product surface. Each one is a sentence the
product already claims and does not keep.

## What changes

### Fetch policy (C-1, C-18)

`validateFetchTarget` strips brackets and zone ids, then classifies the address.
Loopback, link-local, unique-local, multicast, and IPv4-mapped private addresses
are refused, including `https://[::1]/`, `https://[::ffff:127.0.0.1]/`,
`https://[fd00::1]/`, and `https://[fe80::1]/`. The body reader stops at the
existing byte cap and aborts the rest. Tests cover those four URLs and a body
larger than the cap.

### One finish for a run (C-2, C-3, C-17)

`finish` updates a run only where `status = 'RUNNING'`. A cancel that already
landed is left as `CANCELLED`. The summary "No external actions were performed"
is used only when no model call and no sandbox command has started; otherwise
the summary names what already happened.

Run now takes the same claim the scheduler uses (a row lock or an equivalent
`UPDATE` that fails if a run for that routine is `RUNNING`). `inFlight` is set
before any await. Two callers produce one execution.

When a claim fires and `missedIntervalMs` is true, the run summary says the
scheduled instant was missed and this is the single catch-up.

### The budget and Stop apply to every model call (C-4, C-5, C-6, C-7)

`overQuota` runs immediately before every `requestCompletion` on the chat path,
including the router, each consult, and each tool turn. Crossing the cap stores
the existing quota sentence and stops.

Both streamed completions receive `signal: stop.signal`. An abort is not
retried.

An empty stopped handoff writes `chat.stopped` and no assistant row. A partial
handoff is stored as `incomplete` / `stopped`. The "not configured" sentence is
used only when the target profile has no key.

The org-channel composer shows Stop for the whole brief, including summons.

### Labels match the event (C-8, C-9, C-10, C-11, C-12, C-13, C-14, C-15, C-16)

- The 4-step cap stores `metadata.stepLimit` and the thread says the tool-step
  cap was reached. `truncated` stays reserved for the output-token cap.
- `routineProposal` uses the same worker sentence as confirm
  (`workerEnabled()`).
- With a stored last agent, the first screen is that thread. Overview stays a
  rail destination.
- The temperature slider is removed until the gateway sends `temperature`.
- Permission help text matches the code: plan blocks writes; auto and default
  do not auto-approve and do not auto-raise approvals.
- Eval pass/fail/skipped/error counts are SQL aggregates over the workspace,
  and the UI names that scope.
- Shell and browser stay unavailable to the model. The reason says the console
  is person-only and there is no GUI, when a sandbox provider is active.
- Reset is enabled for `local-os` and `wsl`, and stays disabled when the
  provider is `unconfigured`.
- After a short history page, "Load earlier" disappears.

### Inbound retries (C-19)

Cron and trigger secrets are read from `Authorization` only. An inbound brief
accepts `Idempotency-Key` (or a hash of token + body) and returns the existing
run instead of starting another.

## Out of scope

Splitting `route.ts` (spec 26). Agent versions and the effects ledger (spec 27).
A golden-task suite (spec 28). Any new tool, connector, or desktop.

## Verification

`npm test` covers the new policy cases, the finish-if-running update, the
double-claim, the quota re-check, the abort-not-retried stream, and the step-cap
metadata. A browser pass checks: last thread on load, Stop visible during a
brief, reset enabled on the wsl provider, and the permission help text.
