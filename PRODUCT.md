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

## Operating Context

- Local development against a shared PostgreSQL instance; the demo workspace is identified by an HTTP-only cookie, not an account.
- Providers are configured by the operator in `.env.local` before use; the person using the app never sees or handles a key.
- Replies stream token-by-token from an OpenAI-compatible endpoint.

## Capabilities and Constraints

- Working today: workspace seeding; agent create/edit/pause/delete; persisted per-agent threads; provider selection per agent (auto, any configured endpoint, or local); streamed replies with bounded retry; routine proposals from natural language; routine create/toggle/delete; Run Now requests; approval decisions; timezone change; audit events; per-workspace daily model-call budget with estimated token counts.
- Deliberately not working, and must never be presented as working: authentication (cookie demo only), scheduler/worker execution, OAuth connectors, sandbox/computer execution. Existing UI surfaces explain their own unconfigured state.
- Any OpenAI-compatible endpoint is a provider by configuration: `PROVIDERS` plus `<NAME>_BASE_URL` / `_MODEL` / `_API_KEY` / optional `_MAX_CONTEXT`.
- Token figures are estimates at roughly four characters per token and are labelled as such; call counts are exact.
- Some endpoints stream model reasoning inside the answer text; whether to strip, collapse, or pass it through is an open decision (context/current-issues.md L-04).
- All existing views stay reachable. The dashboard views (Runs, Schedule, Tools, Approvals, Settings) are demoted from the main frame to the agent rail, not deleted.

## Brand Commitments

Named Arova, with a calm, plain-spoken voice in its own copy ("Make room for the work that matters", "Arova can make mistakes. Review important actions."). DM Sans body and Manrope headings are incumbent and stay unless the user replaces them.

## Evidence on Hand

- Real PostgreSQL rows: workspaces, agents, messages, routines, runs, run steps, approvals, connections, sandboxes, events, per-day model usage.
- A verified live call to a third-party endpoint (`inference.dahl.global`, model `MiniMaxAI/MiniMax-M2.7`) that streamed 122 deltas into one persisted reply, with usage counted once.
- 17 unit tests over the model gateway (`src/lib/model-gateway.test.ts`), run with `npm test`.
- Sample data exists only in clearly-labelled seed form ("Sample run:", "SAMPLE ACTIVITY"), and the seeded approvals row is labelled a sample.
- Absent, and never to be invented: latency benchmarks, uptime, user counts, testimonials, pricing, integrations that have not been configured.

## Product Principles

1. The interface reports only what the server actually did; an unexecuted action is never shown as completed.
2. Continue-the-work beats overview-of-the-work: the default screen is the last conversation.
3. Boundaries are content. Saying "no worker is configured" in the thread is a feature, not a caveat.
4. Configuration, not code, adds a model provider; the UI reflects whatever the operator has set.
5. Approximate numbers are allowed only when labelled approximate; reply text is never approximate.

## Accessibility & Inclusion

No formal standard has been mandated by the user. Existing controls are keyboard-reachable, form fields are labelled, and error states are distinguished by more than colour. Motion additions must respect `prefers-reduced-motion`.
