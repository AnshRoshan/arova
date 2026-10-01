# Decisions
## D-01: Keep the demo boundary — 2026-09-29
Trigger: User requested a working Grok Bot alternative on an existing demo.
Options considered: imply full computer/tool execution / expose honest demo limits.
Chosen: preserve explicit unconfigured states; model chat is the end-to-end working slice.
Lost alternative: fake successful runs; would mislead users.
Cost paid: narrower claims of capability.
Reversibility: easy once real infrastructure exists.
Correctness policy: never claim external action completion without execution.

## D-02: Per-agent server-side provider routing — 2026-09-29
Trigger: Existing one-shot OpenAI chat could not offer Grok or preserve conversation context.
Options considered: client-supplied keys / server env keys with per-agent selection.
Chosen: persisted provider field and server-side xAI/OpenAI calls with bounded history.
Lost alternative: client keys leak credentials and complicate trust.
Cost paid: operators must configure server keys; chat requests incur model cost/latency.
Reversibility: easy to replace adapter later.
Correctness policy: provider failure is reported, never silently replaced with invented model output.

## D-04: Generic provider profiles over per-vendor code - 2026-09-29
Trigger: User asked the bot to accept any Chat-Completions endpoint (example `https://inference.dahl.global/v1`, model `MiniMaxAI/MiniMax-M2.7`) configured entirely from `.env.local`.
Options considered: one extra CUSTOM_* slot / three bespoke env vars per vendor / a named-profile list (`PROVIDERS=dahl ollama` + `<NAME>_BASE_URL|_MODEL|_API_KEY|_MAX_CONTEXT`).
Chosen: named profiles, with xAI and OpenAI expressed as the same shape rather than special cases. Adding a vendor is an env edit; the picker, routing and health display all follow.
Lost alternative: one CUSTOM_* slot — it loses the moment a second endpoint appears (a LAN model plus a hosted one), which is exactly what the user described, and would keep xAI/OpenAI as hardcoded exceptions.
Cost paid: a name-prefix convention to document (`ollama-local` → `OLLAMA_LOCAL_*`) and a validation rule — a selected provider that isn't in the list is rejected at write time rather than silently defaulting.
Reversibility: easy; the profile list is read from env at request time.
Correctness policy: base URLs are validated to http(s) before any request because the bearer key rides on it. Keys and base URLs never enter a profile object, so board JSON stays safe.

## D-05: Stream, but never replay; count, but call it estimated - 2026-09-29
Trigger: 45s unary waits felt dead on long replies, and a shared demo needed a spend brake.
Options considered: SSE streaming with partial-save semantics / polling the board for the finished reply / unary only with a spinner. For accounting: exact tokenizer / upstream `usage` fields / character-count estimate.
Chosen: SSE with bounded pre-first-byte retries, a daily per-workspace/provider call budget (default 60, `0` disables), and `~4 chars/token` estimates labelled as such in the UI.
Lost alternative: retrying a broken stream too — it would re-emit text the user already watched arrive, so a dead stream instead persists the partial reply flagged `incomplete`. Upstream `usage` lost as a source of truth because many compatible endpoints omit it, and silently reporting nothing reads as a bug.
Cost paid: a second reply path to keep in sync (mitigated: unary and streamed share `planReply`), one new table, and knowingly-imprecise token numbers. A real bug found this way: `pull()` counted as an event rather than a token hung any stream whose reader was slow, so the browser stalled while curl happened to work — see the demand-token counter in `streamReply`.
Reversibility: streaming is per-request (`stream: false` keeps JSON); the budget is one env var.
Correctness policy: message text is never approximate; call counts and token figures may be.

## D-03: Dedicated demo database, config reads env — 2026-09-29
Trigger: A live SYNC/verify pass on this host found `drizzle.config.json` hardcoding `.../app_db`, which on this machine is owned by a different, unrelated application (agent_messages, ai_settings, projects, llm_calls…; no `workspaces` table). Pointing the demo there would have collided, and `push --force` would have dropped another app's tables.
Options considered: reuse `app_db` / delete that data and repurpose it / provision a separate database and read the URL from env.
Chosen: created a dedicated `arova_demo` database, converted `drizzle.config.json` → `drizzle.config.ts` reading `process.env.DATABASE_URL` (dotenv), and updated `.env.example`. Never wrote a `.env`.
Lost alternative: reuse `app_db` — destroys an unrelated project's data and embeds a credential in a committed file.
Cost paid: one extra local database to provision.
Reversibility: easy — the URL is now a single env var.
Correctness policy: setup tooling must never target a database it does not own.

## D-06: Chat-first notebook shell over the dashboard - 2026-09-29
Trigger: User pasted a dark chat-first agent UI and asked for "similar or better", after Feature 02 made the thread carry real provenance.
Options considered: token-polish the existing dashboard / evidence cards inside the current layout / rebuild around one thread with the panes demoted.
Chosen: rebuild. Index + thread + evidence margin, light cool-neutral world with one azure, seeded sample data forced to grey.
Lost alternative: token polish — rejected in advance by the user's standing rule that a colour pass registers as "the old UI", and it would have left the dashboard as the destination while the product's value is the thread.
Cost paid: the Overview screen and its stat cards are gone (their numbers now live per-agent and per-reply); ~23KB of CSS rewritten; every view had to be re-verified. A finish review found eight defects in the first pass, six of them honesty or contrast, all fixed and re-verified.
Reversibility: painful — the shell is the app. Data, API and actions are untouched, so a revert is a UI-only rollback.
Correctness policy: the interface may never imply an action the server did not record. This is now the strongest constraint in the codebase and outranks visual consistency.

## D-07: Team creation and a single peer hop - 2026-09-29
Trigger: User asked for the reference's cross-agent behaviour — "tell Nova to create a product agency, it creates multiple agents and whenever a line requires it, calls a specific agent and gets a reply".
Options considered: create the team immediately / propose then confirm / create then run a worked demo. Native tool-calling for delegation / a JSON directive inside the answer / a separate routing pass before the answer.
Chosen: propose-then-confirm, and a separate routing pass with `MAX_DELEGATIONS` defaulting to 1.
Lost alternative: the directive-inside-the-answer approach was built first and **failed against the live endpoint** — a reasoning model writes "this plays to Scout's strengths" in its `<think>` block and then answers directly, never emitting the protocol. Streaming with a gate could not rescue it, because the reasoning block arrives before any directive. The routing pass does not depend on the answer cooperating.
Lost alternative: native tool-calling — the whole point of the gateway is any OpenAI-compatible endpoint, and tool support is exactly the part those servers disagree about.
Cost paid: a consulted reply costs three model calls, not one; two new tables; a routing call on every message to a teamed agent even when it returns `{"consult":null}`.
Reversibility: `MAX_DELEGATIONS=0` disables delegation without a deploy; the tables stay harmless.
Correctness policy: the router's judgement may be wrong about whether a consult helps. What may never be wrong is what the card claims was consulted for, and the placeholder-question bug (the model echoing `<the single question for them>`) is repaired to the user's own words rather than forwarded verbatim.

## D-08: Capability registry with narrowing-only grants - 2026-09-29
Trigger: User asked where the per-agent configuration lives — which tools, which properties, MCP per agent, who may call whom — noting the handoff was not proper.
Options considered: copy grok-build's full AgentDefinition (isolation, hooks, skills, memory scopes) / add a smaller registry limited to what actually runs / store free-form JSON flags per agent.
Chosen: a 14-tool registry where grants can only narrow the available set, four genuinely runnable tools, and ten listed-with-a-reason unavailable ones. Routing is offered only the actions the agent holds.
Lost alternative: the full field set — isolation, hooks and skills would have been config with no runtime behind it, and the first screenshot a user clicked would have been a lie. Free-form flags lose the ability to enforce anything.
Cost paid: the registry must be edited whenever a real runtime (sandbox, OAuth, MCP transport) lands, and two new enums now need keeping in step with the UI. A second routing shape (approval, handoff) widens the model-decision surface and can misfire in either direction.
Reversibility: easy per field; the capabilities column is one jsonb and every reader falls back to defaults.
Correctness policy: a dormant grant (consult without a team) is shown as inactive rather than silently dropped, so the UI never contradicts the stored config.

## D-09: The reading surface earns its own parsers — 2026-09-29
Trigger: a 1440x900 capture of the running app showed three columns of dead space, a header that read as a debug string, and model replies arriving with literal backticks because `RichText` only knew bold and lists.
Options considered: token-polish the notebook / keep the layout and only fix rendering / rebuild the surface and move parsing into tested pure modules.
Chosen: rebuild. `src/lib/markdown.ts` (blocks + inline, fenced code with an unterminated-fence rule, links restricted to http/https) and `src/lib/identity.ts` (six cool hues, FNV-hashed from the agent id, WCAG-checked in test).
Lost alternative: rendering in the component — it cannot be unit-tested, and the previous renderer had already silently mangled code.
Cost paid: two more modules to keep honest; a hue palette that must never be reused for status.
Reversibility: hues are one inline custom-property map; the parser is one import.
Correctness policy: a stopped or budget-truncated reply may never render as a finished answer. That rule produced three real defects this round — `streamText` returning quietly on a cancelled reader (stored as complete), `finish_reason: "length"` being swallowed (a budget we set blamed on the model), and an unclosed `think` tag rendering an empty bubble.

## D-10: Organisations, and the routing that has to survive a reasoning model — 2026-09-30
Trigger: the user asked the app to actually create a company of agents with a Product Owner and hierarchy, and reported that bots could not talk to bots.
Options considered: let an agent create agents immediately / propose-then-confirm; native tool-calling for the org; a graph the model may draw freely with cycle repair afterwards.
Chosen: propose-then-confirm; a JSON shape from a dedicated design call with `orgTemplate()` as the deterministic fallback; and a `reportsTo` that may only name a seat listed above it, so an acyclic chart is a property of the format rather than a repair step.
Lost alternative: trusting the router alone. Measured, not assumed — the routing call spent its entire 900-token budget inside `think` and emitted no JSON at all, so every consult degraded silently to "answer it yourself". Hence `mentionConsult`: naming exactly one teammate is a deterministic route that does not depend on the model finishing its thinking.
Lost alternative: free-form hierarchy with afterwards cycle detection — more permissive, and it would have needed a visited set in the UI, the tree, the router and the DB.
Cost paid: a chained answer is up to four model calls; `MAX_DELEGATIONS` default 2 makes that the common bill. Ten new agents from one confirm is a loud workspace.
Reversibility: `managerId` is one nullable column; `MAX_DELEGATIONS=0` returns to single-hop; removing `build_org` from an agent's grants removes the capability without a deploy.
Correctness policy: a seat that does not exist cannot be reported to, an agent cannot reach the whole workspace, and the chart in the sidebar is drawn from stored `manager_id` rows — never from a model's description of one.

## D-11: A scheduler with no daemon — 2026-09-30
Trigger: routines had been "saved, not executed" since Feature 01, and the org feature made an unattended run genuinely useful.
Options considered: require a real worker (PM2/cron/queue) / execute on read and say so / keep pretending.
Chosen: `after()`-driven tick on the board read. Next's `after` runs once the response is flushed, so a 45-second model call never holds the page load, and the work is not dropped the way a floating promise was (measured: `void tickSchedules()` claimed nothing at all; `after()` claimed and completed).
Lost alternative: a real daemon — correct, but it cannot be verified inside this preview and would be another thing the demo only claims.
Cost paid: nothing fires while the app is closed. A routine due at 8:00 AM on a laptop that opens at 11:00 runs once at 11:00 and is flagged late; three missed days do not become three runs.
Reversibility: the claim predicate and `next_run_at` column are the whole contract — a real worker can take over by running the same `tickSchedules`.
Correctness policy: the UI states the limitation in the pane header, and a run that cannot execute (paused agent, no key, budget spent) is recorded as FAILED or WAITING_FOR_TOOL with the reason, never as a silent skip.
Bug found on the way: claiming with `eq(nextRunAt, <Date read back>)` never matched — the column keeps microseconds, a JS Date keeps milliseconds, so the compare-and-swap always lost. Claiming by predicate (`lte(nextRunAt, now)`) is both correct and race-safe, because Postgres re-checks the WHERE clause after taking the row lock.

## D-12: The shell becomes a workbench — 2026-09-30
Trigger: the user asked for a complete UI revamp after Features 06–09 had changed what the product can do (orgs, delegation chains, schedules that execute) while the shell still presented a chat app with side panels.
Options considered: A thread-first (two columns, evidence on demand) / B workbench (organisation left, thread centre, live activity right) / C command surface (palette-led).
Chosen: **B**, by the user, on the recommendation that the shell should be shaped around what the system actually does now. A removes the empty column but leaves the org feature decorative; C is the biggest break and the hardest to finish honestly.
Cost paid: the whole of `page.tsx` and `globals.css`, and the direction contract in `layout.tsx`. The evidence margin as a permanent column is deleted, not collapsed.
Reversibility: painful — the shell is the app. Data, API and actions are untouched, so a revert is UI-only.
Correctness policy: the right-hand activity stream may only show rows the server recorded. A live surface is exactly where an invented status would do the most damage.
Timing: the user chose to build it in a fresh session rather than in the remaining budget of this one, so the rebuild gets full context and a real impeccable run.

## D-13: The activity board is a printer, not a dashboard — 2026-09-30
Trigger: Feature 10 replaced the shell (D-12) and the right column needed a real job. The easy version was a status dashboard with summary cards, which is exactly the furniture the old evidence margin already was.
Options considered: static summary cards (agent config, run state, a legend) / a feed of audit events only / a four-section printer where every row names its stored source.
Chosen: the printer. **In flight** is live SSE facts this client actually received (a consult hop, a growing reply) and says "saved when the reply completes" rather than implying storage that has not happened. **Needs attention** is real pending approvals (gated on `realPending`, so a seeded request never raises a demand), runs blocked on the worker that does not exist, and routines whose stored `next_run_at` has passed. **Upcoming** is stored `next_run_at`. **Record** is the newest-first merge of stored runs, delegation hops, selected audit events and decided approvals. A section with no rows is absent, not empty-styled.
Lost alternative: summary cards — they are always true, which is why they say nothing, and at rest they were the empty third column this whole rebuild exists to remove.
Lost alternative: showing every audit event type — `chat.message` and `workspace.created` would drown the rows that mean work; the whitelist is `org.created, team.created, run.cancelled, approval.requested, routine.created, agent.created`.
Cost paid: the board is quiet in a fresh workspace (four seeded sample rows and nothing else), which is the honest state and reads as emptiness next to a dashboard's invented density. Sample rows stay grey and labelled "sample".
Reversibility: `recordRows` is one local assembly block over the existing board payload; no schema or API change was made for this feature.
Correctness policy: no row may exist without a stored row or a received frame behind it. `humanStamps()` reformats an ISO instant embedded in server prose; it never rewrites the words. The provenance line moved inline under the reply it documents, and the printed state legend was deleted — the state words now carry their own meaning in place.

## D-14: Graphite, and the three-hue limit — 2026-09-30
Trigger: after Feature 10 shipped the Workbench, the user replaced the shell themselves with a "Studio Edition" (permanent icon rail + section panel) and asked for the design to be improved, keeping the two-tier sidebar. The result was three `:root` blocks in one stylesheet and ~150 hardcoded hexes layered over a token system that no longer applied — the rail and the activity board read as pasted on.
Options considered (palette): cool paper + dark rail / keep warm off-white + lilac / dark both rails. The user chose **dark theme primary, graphite and neutral colours**, which retires the warm-ivory rule for this surface.
Options considered (identity): six cool hues as before / three hues with the glyph leading / no hues / free the wheel by making state non-chromatic. Chosen: **three tints, glyph-led**.
Why not six: measured, not felt. Reserving one azure for interaction (218°) and green/amber/red for state (152°/37°/342°) leaves 25 of 72 hue slots legible on graphite, and only three of them sit 30° clear of everything reserved in the cool half. A fourth identity colour is arithmetically unavailable; it would be a colour that reads as the accent or as a status. The avatar glyph (six faces) carries identity; the tint is a secondary marker.
Lost alternative: no identity hues at all — calmest, but a long thread then has no cheap way to answer "who said this", which is what the hue was for.
Lost alternative: keep six and relax the test — that ships a roster where two agents look alike and the test stops meaning anything.
Cost paid: identity repeats every three agents in a large org (a 10-seat template will show each tint three times). Accepted because a repeated tint plus a distinct glyph still scans, while a collided tint misreads as status.
Reversibility: `HUES` is one array; adding a fourth requires moving the accent or a state semantic off the wheel first, and `identity.test.ts` will fail until that is decided deliberately.
Correctness policy: the overview states counts as one line of real numbers rather than four large cards, because two of those cards read `00` at rest; a zero is honest in a sentence and is furniture at 30px. The panel is titled by what it holds and the work surface by the section, so no word appears twice on one screen.

## D-15: The org channel, and what it deliberately is not — 2026-09-30
Trigger: the user asked for a group chat for an organisation, pointed out that a human should brief one lead who handles the rest, and noted that agents must be able to talk to each other freely inside an org — not only up and down a reporting line.
What the code actually said: `peersOf` already returns the whole team plus everyone reachable through reporting lines, so **free peer talk already works**; every hop is already audited in `delegations`. What does not exist is a place the work happened — `messages.agent_id` is NOT NULL and 0 rows carry a team, so a hop lives only inside the asker's reply. The ask is therefore a durability problem wearing a chat request.
Options considered (scope): a channel surface only / a channel plus a real autonomous loop / per-seat "sessions" that agents open and close.
Chosen: **channel + a bounded loop.** Four decisions, all the user's:
1. **Fan-out: lead + 2 summons.** Kept `MAX_DELEGATIONS=2` as the ceiling. Lost alternative — cascading depth-N — is genuinely multi-agent but one brief can spend the 60-call daily budget by itself; the demo cannot show that safely.
2. **In-flight posts drill into the existing `runs`/`run_steps`.** Lost alternative — streaming every step into the channel — buries results in progress text at 10 seats.
3. **Hermetic orgs.** An agent consults only its own org and channel history is org-scoped. This *removes* cross-org reach that works today; the user chose isolation over reach knowingly.
4. **Godfather founds, lead staffs its own org.** A permission tier on creation, not on tools — today's grants narrow tools and have no concept of who may found a company.
Cost paid: `messages` needs a nullable `agent_id` and a nullable `team_id` with a check constraint, which touches every message read path; and the loop still cannot run while the app is closed, because there is no worker — a brief is one turn, not a job.
Reversibility: the channel is one column plus one write path; hermetic reach is one filter in `peersOf`; the creator tier is two guards on existing actions.
Correctness policy: **budget exhaustion mid-brief must post a visible row naming which peers were never asked.** A channel that goes silent while work is missing is the worst failure this feature can have, because silence now looks like a team that finished.

### Built 2026-10-01 — four things the plan did not know
- **The router was spending unbilled calls.** `routeDecision()` made a real vendor request and never called `recordUsage`, so `overQuota()` under-counted every day by one call per reply — and a brief's budget guard would have been reading a number that excluded its own routing. Fixed by counting it (with the same reported-vs-estimated rule as every other call). Decision 1's "~3–7 calls per brief" is only enforceable if the router is in the arithmetic.
- **Two stop rows, not one.** `budgetStopRow` names who was *never asked* — right when the loop is cut short. But when every summon answered and the budget died on the way to the report, naming the rest of the bench would be a lie: nobody meant to ask them. `noReportStopRow` credits the posts that exist and says the report never came. Chosen over one function with a flag, because the two sentences are different truths, not different strings.
- **The creator tier needs a way to be set on data that predates it.** `workspaces.creator_agent_id` is null in every existing workspace, and null means "no tier in force" (the pre-Feature-11 behaviour, deliberately kept so nobody's demo breaks mid-flight). So `assignCreator` and `assignOrgLead` exist as human-only actions, and `initialize()` designates the seeded assistant for new workspaces. A guard nobody can turn on is decoration.
- **A reasoning block is not always leading.** The report post opens with its own attribution line, so `splitReasoning`'s anchored regex left the raw `<think>`/`</think>` tags inside what the reader was shown as the answer. It now finds a *closed* block anywhere and keeps every block folded; an *unclosed* block still only counts at the front, because "Use `<think>` to wrap notes" is prose, not reasoning. `markdown.test.ts` pins both halves.

## D-16: memory, a turn ceiling that means it, a denial breaker, and an inbound brief — 2026-10-01
Trigger: the parity study (`context/feature-parity.md`) ranked the gaps between Arova and Grok / OpenAI Dots, and the user said to close them all. Three of the four were buildable inside this repo; the fourth (real tool execution) needs infrastructure the user has not chosen, so it stays refused rather than faked.

Options considered (memory): per-seat private memory / one global workspace memory / **org-scoped notes over the channel**. Chosen: org-scoped, because the user's own words were "each organization should have its own memory… should not lead to other places", and because the channel is the only place in the product that already produces attributable claims worth keeping.
Lost alternative: vector embeddings — `vector` is not available on this Postgres (probed), so a semantic claim would need a server package the user has not agreed to. `to_tsvector` + a GIN expression index is zero-dependency and honest, and the UI says "keyword" rather than implying understanding.
Lost alternative: auto-distillation after every brief — one counted model call per brief, spending a 60/day budget on writing things down nobody read. Distillation is opt-in and lands as a proposal card, the same shape `org_proposal` and `routine_proposal` already use.

**Decisions taken on the user's behalf** (the spec listed them as open; they asked for everything built, so these are the defaults, each reversible in one place):
1. *Who may write*: the human, and any seat **inside that org** — `mayRemember` refuses a cross-org writer absolutely, not only when a creator tier is in force, because memory leakage is the harm being prevented.
2. *Distillation*: ships, opt-in, one call, proposals only.
3. *How much is injected*: 3 notes, 900 characters, pinned first — a ceiling enforced in `selectMemories`, with what was dropped counted rather than silently cut.

Options considered (turn ceiling): delete the `maxTurns` control / leave it decorative / **make it the summons ceiling**. Chosen: the third. It was already edited in the capabilities UI and read by nothing, which is the one thing `ui-rules.md` forbids; `summonCeiling({envMax, seatMaxTurns})` now bounds both the brief loop and each peer's own recursion, and the channel bar prints the number the server will actually apply.
Why not remove it: a reasoning-model user needs a per-seat cost dial, and the org channel gave it something to mean.

Options considered (denials): do nothing / rate-limit by wall clock / **count the human's refusals**. Chosen: `denialBreaker` — 3 consecutive or 10 of the last 50 decided approvals, mirroring the boundary breaker Dots ships, because a seat that has been refused three times has already been answered. It withholds the fourth request and says it is withholding; the row is `approval_withheld`, and nothing is inserted into `approvals`, so the human's queue does not grow.
Correctness policy: the breaker counts only what the human actually decided — an unanswered PENDING request is never a denial.

Options considered (inbound events): a worker / a queue / **a bearer token that calls in**. Chosen: the third, because it is the only one that does not pretend. `/api/trigger` runs the same `runBrief` the browser uses, inside the request, scoped to one org, with a 60s cooldown so one misconfigured webhook cannot spend the day's budget, and the resulting channel post is authored by the trigger and says so. There is still no daemon, and the panel's own copy says nothing keeps running after the caller hangs up.
Cost paid: `streamBrief` had to become `runBrief(send, isClosed)` plus a thin SSE wrapper — a 140-line mechanical move, verified by tsc and by re-running the browser pass rather than trusted.
Reversibility: memory is one table and one retrieval call in `planReply`; the ceiling is one function; the breaker is one function plus one branch; the trigger is one route and one table. Each can be removed without touching the others.

## D-17: the OpenBot reference, the three steals, and the sign-in shape — 2026-10-01
Trigger: the user asked to check "openclaw", but the link was `github.com/CopilotKit/openbot` = **OpenBot** (a different project from the `openclaw` lobster assistant). When a name and a URL disagree, the URL wins and the difference is said out loud. Read from the repo/docs, not press, so `context/feature-parity.md` gained a third dated section (§7).

The verdict given to the user: neither side is "far better" — they win opposite halves. OpenBot (and Dots/Grok behind it) is the better **product** (real computers, browsers, shells, accounts = substrate); Arova is the better **argument** (orgs, reporting lines, consult/handoff with per-hop rows, the durable channel, per-seat budgets, any-endpoint = structure). OpenBot has **no** agent-to-agent structure, so the §4 lead survives the third reference. "Far better and not implementable here": the per-Bot container — needs a Docker supervisor and an accepted risk class, so it stays §5.5, refused not faked.

**The three steals** were chosen by "small, testable, no dependency, no credentials" and built together as Feature 14 (spec `14-openbot-steals.md`), one unit each, failing test first:
- Standing **provenance sentence** (`src/lib/provenance.ts`), appended after seat instructions and skills by the deployment, so no seat can argue it away — the OpenBot platform-wide block.
- **Fatigue rule** (`src/lib/fatigue.ts`): one message on the first failure, silence 2–9, ten consecutive switches a routine off with a final message; explicitly not a retry policy. `routines.fail_streak` backs it; a human resume resets it.
- **Initiator on every run** (`runs.initiator` = person|routine|trigger): OpenBot's insight that a rule must be able to refuse an unattended run what it allows a typer. Built as the **seam, not yet the policy** — no headless path reaches a write today, so the column exists to force the first write-by-agent path through a decision. Recording it as a seam, not pretending a policy, is the honest half.

**Decision taken on the user's behalf, FLAGGED for review:** the fatigue counter treats `WAITING_FOR_TOOL` (a daily-budget wait) as a failure to produce, because a budget-starved routine is exactly the "expired key fires cleanly every night" case the rule exists to kill. Reversible in one line (`FAILURE_STATES`).

Options considered (sign-in, asked and answered with the user, not assumed): one workspace + signed-in people / workspace-per-person / identity-labels-the-cookie. Chosen: **one workspace, first person in owns it**, because it keeps the single-space demo story and matches OpenBot's `/admin/people` shape. Providers: **env-driven OIDC with a Google preset** (the `PROVIDERS` doctrine applied to identity — adding Microsoft is an env edit), over Google-only (code edit to extend) and a full SAML/email-domain admin UI (much bigger surface for 80%-of-the-value now). Order: **steals first, sign-in second**, so the big auth feature lands on a calmer tree with a clean session/roles story instead of being mixed with policy changes.

**Hard external boundary the user's "whatever you want" cannot wave away:** real Google login is gated on OAuth credentials only the human can mint (Cloud Console) and paste into `.env.local` (secrets never enter chat — workflow rule; AGENTS.md: never describe unconfigured OAuth as working). So sign-in ships **env-gated**: with no `AUTH_PROVIDERS` the app is byte-for-byte today's demo and the settings panel names the variables that would turn real login on; the moment they exist, the routes activate. `OPENBOT_SINGLE_USER` is the precedent for saying which mode you are in. Spec `15-signed-in-people.md`, not yet built — the foundation is started test-first.
