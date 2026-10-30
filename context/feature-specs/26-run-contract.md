# Feature 26 — One run contract

## The problem

`src/app/api/board/route.ts` is about 1,900 lines and owns three different ideas
of a run: the scheduler tick, chat/brief streaming, and the sandbox console.
Cancel, claim, and Stop do not share one lock or one abort signal. Spec 25
patches the known holes. The next feature added as another `else if` will copy
one contract and miss the other two. `context/current-issues.md` C-20 is the
schema half of the same drift.

## What it is

Move tick/claim, `executeRoutine`, `streamReply` / `runBrief`, and the sandbox
action into modules. `POST` authenticates, parses, and dispatches.

Every module that finishes a run takes:

- an `AbortSignal`;
- a `finish(status, summary)` that updates only a `RUNNING` row;
- the workspace id, and nothing fetched from module globals except the database.

`inFlight` stays process-local and is documented as such. Two OS processes are
still fenced only by the SQL claim.

## Schema (C-20)

- `delegations.message_id` and `channel_deliveries.run_id` gain foreign keys
  with `ON DELETE SET NULL`.
- `sandboxes.minutes_used` is set from the command's wall-clock seconds, or the
  column is dropped from the export until it is. A real run must not export as
  0 minutes.
- The provider default becomes `unconfigured`.
- `connections` is dropped, or its default stops saying `CONNECTED`, until a
  connector exists.

## Out of scope

A multi-process lease. An event journal (spec 27). Changing what the model is
allowed to call.

## Verification

The existing scheduler, stop, and sandbox tests still pass against the moved
modules. A new test shows `finish` leaving a `CANCELLED` row untouched. `tsc`
is clean. No behaviour change beyond spec 25 and the schema rows above.
