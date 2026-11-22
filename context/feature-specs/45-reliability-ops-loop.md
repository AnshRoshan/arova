# 45 — Reliability ops loop (suites as regression gates)

**Status: SHIPPED 2026-11-23 (history + trend + promote + `npm run evals` gate; CI wiring is the
owner's cron/CI call).**

**Problem.** The 2026 reliability playbook is continuous evals — pass rate plus revision rate as
the dashboard pair, a regression gate in CI, incidents promoted into the suite. Arova's suites ran
on demand and kept only their latest counts, so "honest by design" was still not "honest and
measured".

**Scope shipped.**
- `suite_runs` table: every suite run is a stored point (status, counts, model calls, trigger
  person|ci, started/finished).
- Board: a History & trend section per suite — the last 8 runs as scored chips, the latest scored
  pass rate, and re-runs after a failure (the revision signal).
- `npm run evals` (`scripts/eval-gate.ts`): runs every suite (or `-- --suite "Name"`) through the
  same runner the board uses, records its own history row with `trigger: "ci"`, and exits non-zero
  below `EVAL_GATE_MIN_PASS` (default 0.9). A server with no model key **skips honestly and exits
  0** — a gate that cannot run says so rather than failing the build silently or lying by passing.
- `promoteRunToEval`: from a failed run, the run's own prompt (its initiating user message, falling
  back to the summary) becomes an eval task; the person supplies the expected fragment, so the
  regression tests the failure honestly instead of encoding a guess.
- Promote affordance lives in the run dialog for FAILED/TIMED_OUT runs.

**Acceptance met.** Two suite runs produce two history points and a trend; the gate exits 1 below
threshold and 0 on skip (no suites yet → "nothing to gate", exit 0, verified live); a failed run
becomes an eval task in one action.

**Honest boundary.** No OTLP/metrics export (traces stay a later slice); the gate skips when no
model key exists, which means an unkeyed CI never gates — that is stated in its own output.
