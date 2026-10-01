# Build plan
## Current slice: the parity gaps — built and verified 2026-10-01
Spec 11 gave an organisation one durable conversation. The parity study then asked what was missing, and
specs **12** (organisation memory) and **13** (the denial breaker, the inbound trigger, and two controls
that were wired to nothing) close the gaps that were closable in this repo:

- A brief now retrieves what its own organisation decided and prints which notes it used; every note is
  attributable, pinnable, and individually forgettable.
- A seat that has been refused three times in a row stops asking and says it is holding.
- Something outside the browser can brief one organisation with a bearer token, and the ask lands in that
  channel authored by the trigger.
- `maxTurns` and the unary reply path now do what the UI says they do.

## Next slice candidates (each needs its own spec)
- **Message pagination and retention.** `board()` still returns every message, memory and trigger row per
  workspace. It was fine at ten seats and three briefs; it is the first thing that will hurt a real one.
- **A per-seat live view.** A channel post links to the brief's run and steps; there is still no seat-side
  "what am I doing right now" surface, which the user asked for in the same breath as memory.
- **A brief that continues past the request.** Triggers make work *start* from outside; nothing keeps
  working when the caller hangs up, because there is no worker. That is an infrastructure decision.
- **Connectors and citations.** Both blocked on credentials and an allow-list policy, not on code. The tool
  registry says so per tool; leave it that way until someone supplies a key.

## Research pass (2026-10-01) — a living document
`context/feature-parity.md` holds Arova's code-verified inventory (§1), the **Grok** and **OpenAI Dots**
inventories as of 2026-10-01 (§2–3, every unverified claim left flagged), the axis-by-axis matrix (§4), the
gap ranking bounded by what this stack can actually do (§5), and what was built from it (§6). Re-run the two
inventories when either vendor ships, and re-derive §1 from the code rather than trusting the document.

## The 2026-09-30 breakdown, closed
- **11a Channel storage and posting** — built. `messages.team_id` + nullable `agent_id` with the one-subject check; hops post into the channel instead of vanishing into a reply.
- **11b The turn loop** — built as *bounded*: lead + up to `summonCeiling` summons + one report, inside one request. No cascade, no queue.
- **11c Live work visibility** — built as *drill-in*: an in-flight post links to the brief's `runs`/`run_steps` row; nothing streams step text into the channel.
- **11d Per-organisation memory** — **built (spec 12)**: org-scoped keyword memory over the channel, with provenance that names what was retrieved. What it is *not* is semantic recall — `vector` is unavailable on this Postgres, and the UI says so.
- **11e Who may create** — built: `workspaces.creator_agent_id` gates founding, `teams.lead_agent_id` gates staffing inside one's own org, and a lead can now *create* the seat as well as place one (spec 11 follow-on), with refusals that name the rule.

## Later, not in this slice
Authenticated accounts and memberships; per-provider rate limits and true cost accounting (a real tokenizer instead of the ~4-char estimate); non-Chat-Completions adapters (OpenAI Responses, Anthropic, Gemini); actual isolated sandbox; OAuth connectors; scheduler/worker; approval broker that performs actions. Each needs its own spec.
