# Feature 17 — Eval and reliability harness

## The problem

The market brief's strongest evidence is that long-horizon computer agents fail often: OSWorld 1.0's
best agent is 63.5% against a 72.36% human baseline, and OSWorld 2.0's best agents are around 44% on
long-horizon workflows. Arova's answer is a review-first product, but it had no measurement of its own.
Without one, "honest" is a design claim.

The first harness is intentionally narrow: **one prompt, one answer, one expected fragment**. It is a
substring check, not a model judge. A judge would add a second model call, a second bill and a second
opinion that cannot be replayed.

## Data model

- `eval_tasks`: `id`, `workspace_id`, `agent_id`, `name`, `prompt`, `expected`, `created_at`.
- `eval_results`: `id`, `workspace_id`, `task_id`, `agent_id`, `run_id NULL`, `status`
  (`PASS` | `FAIL` | `SKIPPED` | `ERROR`), `score` (1/0), `detail`, `duration_ms`, `created_at`.

Every attempt also creates a real `runs` row (`Eval · <task>`) and a step, so the audit trail is the
same as any other execution.

## Server behaviour

- **Create / delete task**: agent must belong to the workspace; prompt and expected are required.
- **Run** (`runEvalTask`): resolve the agent's provider. If it is `local` or unconfigured, insert a
  `SKIPPED` result and a failed audit run with the reason — never a fabricated pass. If the daily budget
  is spent, the same. Otherwise one unary model call, score with `scoreEval`, record usage, and insert
  `PASS`/`FAIL` with the answer excerpt and duration. A thrown call is `ERROR`, not a pass.
- **Summary**: `summariseEvalResults` excludes `SKIPPED` and `ERROR` from the pass rate; an empty suite
  reports `null`, not 100%. Median duration is computed over scored attempts only.

## UI

Automations → Evals: pass rate, attempts/passed/failed/skipped, median duration, a create form, task
rows with last result and Run/Delete, and the recent results ledger. The copy says the score is a
case-insensitive substring check, not a judge.

## Constraints that survive

- No model judge, no hidden second call.
- `SKIPPED` is a measured state, not a failure and not a pass.
- The eval run is a real run in the audit, visible in Runs and the activity board.
- No new colour: PASS uses the existing `ran` tone, FAIL `fault`, SKIPPED `waiting`.

## Out of scope (recorded, not implied)

Golden-task suites per archetype, cost/steps per task, trend charts, LLM-as-judge, multi-turn tasks,
tool-using tasks, a public benchmark score. The current harness is the seam for those.

## Verification (2026-10-28)

- `src/lib/evals.test.ts` 4/4: case/whitespace normalisation, empty answer/expectation reasons,
  skipped excluded from the rate, median, null for an empty suite.
- Live: created a task; ran it with no model key configured → `SKIPPED`, score 0, detail "Local is not
  configured on this server, so nothing was called.", a real `Eval · Says READY` run and result row.
- UI: Automations → Evals rendered the summary, task and result; pressing Run produced the SKIPPED row
  and toast; no console errors in the live snapshot.
