# Feature 08 — Schedules that execute

Goal: a routine that says "every weekday at 8:00 AM" produces a real run at 8:00 AM, with a real
answer in the thread, instead of a row that waits forever for a worker nobody configured.

## What "executes" means here, honestly
This deployment has **no background process**. There is no cron, no queue, no daemon. So the
scheduler ticks when the workspace is read (a board GET/POST), and the UI says exactly that:
*"runs when this workspace is opened — there is no server-side daemon here."* A routine that was
due while the laptop was closed fires on the next open, once, and is marked `missed` when the gap
is longer than its own interval. Pretending otherwise would be the same lie in a nicer font.

## Design
- `src/lib/scheduler.ts` — pure, tested. `parseSchedule(label)` turns the five saved labels (plus
  `Every N hours`) into `{ minute, hour, weekdays, everyHours }`. `nextRunAt(schedule, timezone, after)`
  resolves the next occurrence **in the workspace's IANA zone**, so 8:00 AM in Asia/Kolkata is not
  8:00 AM in America/New_York. `isDue`, `dueNow`, and a `describe` used by the UI.
- DST is handled by comparing wall-clock instants through `Intl`, not by arithmetic on UTC offsets.
- `routines` gains `last_run_at`, `next_run_at`, and `last_status`. `next_run_at` is stored so the
  index can show a due time without recomputing per row.
- Claiming is atomic: `UPDATE routines SET last_run_at = now() WHERE id = ? AND last_run_at IS
  DISTINCT FROM ?` — two tabs opening at once cannot double-run a routine.
- A run created by the scheduler is a real run: `RUNNING` → steps → `COMPLETED` with the model's
  answer as the summary, and the answer is posted into that agent's thread as a normal message.
  It respects the existing daily model-call budget, so a workspace cannot spend itself dry.
- `Run now` keeps working and now genuinely runs, idempotent per key as before.

## Verification standard
Unit tests for every schedule label, the timezone math, DST boundaries, missed-run detection and the
due-window. Live: a routine with a past `next_run_at` fires on the next board read, produces a run
row, a step, and a thread message, and the second read does not repeat it.

## Out of scope
Cron expressions, per-minute precision, cross-instance leases (there is one database and no
cluster), and any claim that anything happens while the app is closed.
