# 46 — Cost attribution

**Status: SHIPPED 2026-11-23 (pricing math tested; per-run stamping on routine runs; dashboard
priced; brief-per-hop aggregation is a recorded boundary).**

**Problem.** Budget counts calls; every competitor shows spend. A small team self-hosting needs
"what did today cost", or the daily-call ceiling is a blunt guess.

**Scope shipped.**
- `src/lib/cost.ts` (pure, tested): pricing arrives per provider as env —
  `<NAME>_PRICE_IN` / `<NAME>_PRICE_OUT`, dollars per million tokens, both sides required; a
  half-priced provider is unpriced, never free. Dollars math over stored tokens; readable figure
  formatting (¢ under a dollar).
- `runs.input_tokens` / `output_tokens` — stamped by the routine runner from the usage the
  provider actually reported (estimated fallback stays labelled), so a run's cost is derivable
  from stored rows plus the env.
- The board's usage dashboard prices every row and shows today's total; an unpriced provider
  carries `null` and the UI can say "unpriced" — the invariant of this spec is that cost is never
  shown as $0 when it is merely unknown.
- `.env.example` documents the pricing pairs.

**Acceptance met.** A run's cost is derivable from stored rows alone (tokens stamped + pricing
env); the dashboard reconciles with the usage table by construction (same rows, same math);
unpriced is a visible state (5 tests pin the math and the null semantics).

**Honest boundary.** Briefs execute across many hops with per-hop usage already recorded in the
aggregate usage table, but not yet stamped per brief-run; chat replies record usage in metadata,
not in run rows (chat has no run row). Both are named here rather than hidden — the aggregate
dashboard is correct either way.
