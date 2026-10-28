# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person, every day. They keep a small set of named agents they actually talk to, and the threads accumulate real history. Success is opening the app and continuing where they left off, not touring a dashboard. Secondary audience: whoever they hand a link to, who lands in a fresh cookie-scoped demo workspace with seeded sample agents.

## Product Purpose

A workspace where a person creates named AI teammates, chats with them across persisted threads, turns repeated intents into routines, and reviews what the system recorded. It exists to make model-backed assistants usable as everyday tools rather than a chatbot tab.

## Positioning

Every claim in a thread is a row the server actually returned. The app states its own boundaries in the interface: an unconfigured provider, a run waiting on a worker that does not exist, and a partial reply from a dead stream are each shown as what they are. A neighbouring product could copy the layout; it would have to give up fabricated success states to do so.

The working position is **self-host first** (D-19): free software plus the operator's model and server cost, with no hosted price until there is a hosted product. The market brief (`context/feature-parity.md`) records why: hosted agents are a commodity at $15–200/user/month, while governed, attributable multi-agent work for a small team that owns the stack is unserved.

## Operating Context

- A dedicated `arova_demo` database on a shared PostgreSQL server; never `app_db`, which belongs to another project. The demo workspace is identified by an HTTP-only cookie, not an account.
- Providers are configured by the operator in `.env.local` before use; the person using the app never sees or handles a key.
- Replies stream token-by-token from an OpenAI-compatible endpoint.
- External channels are operator-configured HTTPS webhooks. The target URL is a credential and stays server-side.

## Capabilities and Constraints

- Working today: workspace seeding; agent create/edit/pause/delete; persisted per-agent threads; provider selection per agent (auto, any configured endpoint, or local); streamed replies with bounded retry; routine proposals from natural language; routine create/toggle/delete; Run Now; the in-process scheduler worker plus `/api/cron` and `/api/trigger`; team and organisation structure with reporting lines; `consult`/`handoff` with per-hop rows; org channel; reviewable org memory (keyword, not semantic); approvals and the denial breaker; local tools (calculator, clock, JSON, checksum) and `web_fetch` behind an SSRF policy; an **opt-in read-only tool loop** (local tools, `web_fetch`, and `web_search` when a provider is configured) with numbered citations and a stored Sources line; external channels (generic HTTPS webhook + inbound org token, with a delivery ledger and bounded retries); the eval harness (substring score, honest `SKIPPED`/`ERROR`); the agent registry (exact SQL aggregates) and **audit JSON export**; an **opt-in local OS shell/files sandbox** behind `AROVA_SANDBOX_PROVIDER=local-os` (fail-closed until the host is provisioned; no GUI; output cap; workspace reset; run history); timezone change; audit events; per-workspace daily model-call budget with estimated token counts. OIDC sign-in is built behind configuration; without it the cookie is the whole identity.
- Deliberately not working, and must never be presented as working: production authentication without an OIDC provider; a GUI desktop, browser stream, snapshots, resume or takeover (the local OS sandbox is shell/files only); model-initiated writes, shell, browser or connector calls (the tool loop is read-only and opt-in); OAuth connectors; MCP transport; billing. Existing UI surfaces explain their own unconfigured state.
- Any OpenAI-compatible endpoint is a provider by configuration: `PROVIDERS` plus `<NAME>_BASE_URL` / `_MODEL` / `_API_KEY` / optional `_MAX_CONTEXT`.
- Token figures are estimates at roughly four characters per token and are labelled as such; call counts are exact. A provider-reported figure is labelled reported.
- Some endpoints stream model reasoning inside the answer text; whether to strip, collapse, or pass it through is an open decision (context/current-issues.md L-04).
- All existing views stay reachable. The dashboard views (Runs, Schedule, Tools, Approvals, Settings) are demoted from the main frame to the agent rail, not deleted.

## Brand Commitments

Named Arova, with a calm, plain-spoken voice in its own copy ("Make room for the work that matters", "Arova can make mistakes. Review important actions."). DM Sans body and Manrope headings are incumbent and stay unless the user replaces them.

## Evidence on Hand

- Real PostgreSQL rows: workspaces, agents, teams, messages, routines, runs, run steps, delegations, memories, approvals, channels, channel deliveries, eval tasks/results, events, per-day model usage.
- A verified live call to a third-party endpoint (`inference.dahl.global`, model `MiniMaxAI/MiniMax-M2.7`) that streamed 122 deltas into one persisted reply, with usage counted once. On 2026-10-28 the same endpoint had no key configured, so eval runs were honestly `SKIPPED` rather than fabricated.
- **208/208** unit tests (`npm test`), typegen, `tsc --noEmit` and `npm run build` green on 2026-10-28.
- Live checks on 2026-10-28: a webhook test to httpbin.org delivered; a test to example.com recorded `FAILED: example.com answered 405`; an inbound org channel ran its local-provider lead and returned an honest failure, with the second immediate call `429`; the registry's counts matched the stored runs.
- Sample data exists only in clearly-labelled seed form ("Sample run:", "SAMPLE ACTIVITY"), and the seeded approvals row is labelled a sample.
- Absent, and never to be invented: latency benchmarks, uptime, user counts, testimonials, pricing, a pass rate without a measured suite, integrations that have not been configured.

## Product Principles

1. The interface reports only what the server actually did; an unexecuted action is never shown as completed.
2. Continue-the-work beats overview-of-the-work: the default screen is the last conversation.
3. Boundaries are content. Saying "no worker is configured" in the thread is a feature, not a caveat.
4. Configuration, not code, adds a model provider; the UI reflects whatever the operator has set.
5. Approximate numbers are allowed only when labelled approximate; reply text is never approximate.

## Accessibility & Inclusion

No formal standard has been mandated by the user. Existing controls are keyboard-reachable, form fields are labelled, and error states are distinguished by more than colour. Motion additions must respect `prefers-reduced-motion`.
