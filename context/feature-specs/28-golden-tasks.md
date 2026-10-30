# Feature 28 — Golden-task suite

## The problem

The eval harness scores one prompt against one expected fragment and records
`SKIPPED` and `ERROR` honestly. Feature-parity §6.5 says that without a
measured pass rate, the honesty claim is a preference. This spec is that
measurement. It does not invent a benchmark score.

## What it is

A suite is a named list of the existing eval tasks, plus a cost ceiling in
model calls. Running a suite runs each task through the current harness, in
order, and stores one suite row:

- suite name, agent, started at, finished at;
- pass, fail, skipped, error counts (SQL, not a window of recent rows);
- model calls spent;
- status `COMPLETE`, `STOPPED_AT_CEILING`, or `SKIPPED` when no provider is
  configured.

The Automations → Evals pane lists suites and the last result. A suite with no
scored task shows no percentage. `SKIPPED` and `ERROR` stay out of the rate,
matching spec 17.

Ten tasks is enough for the first suite. The owner names the prompts. The
software does not generate a leaderboard or compare Arova to OSWorld.

## Out of scope

LLM-as-judge. A public pass-rate claim. Multimodal tasks. Any task that needs
a desktop, a shell, or a connector.

## Verification

Unit: a suite of two tasks aggregates counts and stops at the call ceiling
without starting the next task. Live, with no model key: the suite row is
`SKIPPED` and no percentage is shown. Live, with a key: one real suite records
pass/fail and the call count matches `model_usage` for that window.
