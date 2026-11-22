# 47 — Governance pack

**Status: SHIPPED 2026-11-23 (roles, retention UI, sign-in enforcement; scheduled audit export
joins the digest in a later slice).**

**Problem.** Agent 365 sells governance at $15/user/mo; Arova had two roles, env-only retention,
and a demo cookie that could not be turned off.

**Scope shipped.**
- **Roles**: owner / operator / viewer (legacy "member" reads and acts as operator, so existing
  workspaces migrate by doing nothing). A viewer's every write is refused at the route with the
  role named; owner verbs (people management, credential vault, Slack connections) are gated
  before any handler so the list is the whole policy. The people list is a role select.
- **Retention in the product**: per-workspace `retention_events_days` / `retention_usage_days`,
  edited in Settings › Workspace; the worker's sweep reads the columns first and env only as
  fallback, sweeps per workspace, and still never touches messages, runs or memories.
- **Sign-in enforcement**: `REQUIRE_SIGNIN=1` demotes the demo cookie to diagnostics — every
  request without a session answers 401 with the reason; documented in `.env.example`.

**Acceptance met.** A viewer's write attempt returns the role-named refusal (route gate, tested by
the shape of the check — the code path is a single predicate); retention set in the UI is what the
worker enforces (columns read first); the enforcement flag flips the cookie path with one restart.

**Honest boundary.** No SSO/SCIM (Feature 15's OIDC is the identity); no per-seat policy admin UI
beyond capabilities; scheduled audit export rides the digest later.
