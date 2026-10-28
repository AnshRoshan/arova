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
- **The creator tier needs a way to be set on data that predates it.** `workspaces.creator_agent_id` is null in every existing workspace, and null means "no tier in force" (the pre-Feature-11 behaviour, deliberately kept so nobody's demo breaks mid-flight). So `assignCreator` and `assignOrgLead` exist as human-only actions. ~~`initialize()` designates the seeded assistant for new workspaces.~~ Corrected 2026-10-01: `initialize()` now creates an empty workspace and designates nothing; sample seats live only in `seed/`. A guard nobody can turn on is decoration.
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

## D-18: Deepen the Midnight look, and end the docs/test drift — 2026-10-06
Trigger: the user asked for a UI improvement — "colors and other stuff". The audit found two stacked design worlds: the code shipped a "Midnight" palette (rewritten `:root` — void `#07080d`, azure `#8b9bff`, radii 8/12/16 — plus an appended polish layer of aurora, glass, gradients) while DESIGN.md/ui-tokens.md still documented the retired Graphite palette (`#131416`/`#7ba6ef`, radii 6/8/10, flat-by-default), and `identity.test.ts` asserted contrast against the retired hexes — it passed only because the live surfaces are darker, so it no longer measured the shipped palette.
Options considered: (A) deepen the current Midnight world and sync docs+tests to it; (B) delete the polish layer and restore the documented Graphite world; (C) go bolder — per-room gradient themes across every surface, accepting rule changes. The user chose **A**.
Why not B: the built world is what the user has been looking at since the always-on session (the palette captures in `.impeccable/shots/` are of it); reverting would be a bigger visual change sold as "improvement", and the Graphite docs described a world the code had already left — the drift was in the docs, not the code.
Why not C: it spends the colour budget on decoration and reopens the Room-Colour and Three-Mark rules for no legibility gain; A keeps every honesty rule intact.
What changed (all paint or token plumbing; no layout, no behaviour):
- **Tokenised the light layer.** The accent and state families were ~40 hardcoded `rgba(139,155,255,…)`-style literals scattered through the polish layer; they are now six `:root` channels (`--azure-rgb`/`--indigo-rgb`/`--violet-rgb`/`--ran-rgb`/`--waiting-rgb`/`--fault-rgb`) consumed as `rgb(var(--azure-rgb) / .12)`. A retint is now one line; `grep` proves zero leftover literals.
- **Room-coloured stage aurora.** The workbench background's primary radial now mixes the open room's `--sec` (`color-mix(in srgb, var(--sec) 18%, …)`), so each of the six rooms breathes its own hue behind the work surface. This extends the Room-Colour Rule from chrome to stage light — recorded here because it is a rule-relevant change, not a silent one.
- **State dots glow with their own state colour** (board rows, panel dots, seat nodes, live pulses), matching the chips that already did. The glow inherits the Stored-Row Rule exactly: it appears only where a stored row produced the state.
- **Gradient meters, inset edges on the sheet-bar/code-bar, wider mobile agent-card gaps** (the "Available2 messages" jam visible in the before-capture), `99px` pills unified (three `999px` stragglers), `--on-azure` referenced instead of four `#0a0d28` literals, the unused `--glass` token deleted, and the orphaned `.sp-kicker`/`.header-eyebrow` rules removed (DESIGN.md already called them orphaned).
- **Docs and tests re-pointed at the shipped palette.** `identity.test.ts` now parses `src/app/globals.css` for the surface/accent/state hexes it measures (plus a new assertion that the stylesheet declares every token and that no surface equals the accent) — so a palette swap fails the gate until the separation/contrast arithmetic is re-checked deliberately. DESIGN.md was rewritten from the built world (Midnight frontmatter, the light layer's tokens and jurisdictions, the Depth-from-Light Rule replacing Flat-by-Default, the extended Room-Colour Rule, the documented radii ladder) and ui-tokens.md synced to match.
Cost paid: the "flat by construction" claim is retired — resting raised cards carry `--edge`+`--lift` and chrome uses glass. That was already true in the code; it is now written down rather than contradicted by the authority file.
Reversibility: every change is inside `globals.css` + `identity.test.ts` + docs; reverting the stylesheet reverts the look with no data or API effect.
Correctness policy: unchanged — colour still only ever means interaction, a stored state, an identity, or a room; nothing added implies an action the server did not record. Evidence: `.impeccable/shots-before/` vs `.impeccable/shots-after/` (same workspace, per-file md5, `CONSOLE: []`, no overflow at 1440×900 or 390×844).

## D-19: self-host first; do not invent a hosted price — 2026-10-28
Trigger: the market brief rev 2 (`context/feature-parity.md` §0, §6). Hosted "agent with its own computer" is now a commodity at $15–200/user/mo, and the first agent is usually bundled into a plan the buyer already has (Dots, Duet, Spark, Muse). The unserved position is governed, attributable multi-agent work for a small team that owns the stack; Arova already has the structure and record, and has no billing, no multi-tenant SaaS and no hosted price.

Options considered: (A) **self-host first**, free software plus the operator's model/server cost, no hosted price until a hosted product exists; (B) hosted SaaS now, which needs billing, quotas, row-level isolation, production auth and a support desk before the first customer; (C) both at once, which is two products and one team. Chosen: A.

Why not B: it enters a market where the marginal price of the first agent is zero inside an existing plan, while Arova's substrate (no computer, no connectors) is behind. Why not C: the same focus problem, plus two auth models to keep honest. A is reversible: the app is already a single-operator workspace with a cookie/session boundary, and a hosted pilot can be added later without changing the domain model.

Root `OpenDots` decision D-30 (self-host tool vs hosted service) remains the owner's call; this is the working answer that lets the product move without inventing billing. Reverses when: a paid hosted pilot is requested, or self-host adoption produces a support demand the operator wants to productize, or the kill criteria in §6.5 fire.
Evidence: market brief §0–§6; `README.md` runbook is already a self-host path; no billing schema or price in the tree.

## D-20: channels are a contract, not an OAuth project — 2026-10-28
Trigger: the market brief ranks external channels as the first distribution gap. Every hosted competitor has Slack/Teams/WhatsApp/voice; Arova had only the browser.

Options considered: (A) **generic HTTPS webhook + per-channel inbound token**, which Slack incoming webhooks satisfy without an OAuth install; (B) Slack Events API/OAuth install first, which needs an app, credentials and a verification flow; (C) pull-only notifications (the user checks Arova), which does not close the gap. Chosen: A.

Why: it is a real delivery path today, with the same SSRF policy as `web_fetch`, a delivery ledger and a token scoped to one org. Slack/Teams/Telegram/email become adapters behind the contract. Cost: one `channels` table, one `channel_deliveries` ledger, one inbound route, and a best-effort `notifyChannels` hook on routine/brief completion and approval requests. Delivery failure never changes the run's status; it is a row and a `lastError`.

Reversibility: delete the table/route/hook; the run/audit path is unchanged. Evidence: spec 16; `src/lib/channels.ts` 9 tests; live `DELIVERED` (httpbin.org), live `FAILED` (example.com 405), inbound run + 429 cooldown.

## D-21: an eval is a substring check, not a model judge — 2026-10-28
Trigger: the market brief's reliability evidence (OSWorld 1.0 63.5% vs human 72.36%; OSWorld 2.0 ~44% long-horizon). Arova had no measurement of its own, so "honest" was a design claim.

Options considered: (A) **one prompt, one expected fragment, a case-insensitive substring score**; (B) an LLM judge, which adds a second model call, a second bill and an unreplayable opinion; (C) no harness until a full golden-task suite exists. Chosen: A.

Why: it is cheap, replayable and exactly as narrow as it looks; the UI says "substring check, not a model judge". `SKIPPED` (no provider/budget) and `ERROR` are measured states, excluded from the pass rate; an empty suite reports `null`, not 100%. Every attempt is a real `runs` row and step.

Cost: one `eval_tasks` table, one `eval_results` table, one action, one UI tab. Reversibility: delete the tables/action/UI; no existing path depends on them. Evidence: spec 17; `src/lib/evals.ts` 4 tests; live `SKIPPED` with no model key and a stored audit run.

## D-22: the registry is a read model with exact SQL aggregates — 2026-10-28
Trigger: Agent 365 proves that observe/govern/secure is a paid layer; Arova had the rows and no view. The board's run/approval windows are 60 rows, which would undercount.

Options considered: (A) **a read model over existing tables with exact group-by aggregates**; (B) reuse the board's 60-row window, which is cheap but lies about counts; (C) a materialized `registry` table, which is a second source of truth and goes stale; (D) a health score, which invents a judgement the data cannot support. Chosen: A.

Why: no new table, no score, no fabricated time — an agent with no run says "no run recorded". Counts come from `max(started_at)`, `array_agg(status …)[1]`, and `count(*)`; the pure `buildRegistry` is testable and the UI filters client-side.

Cost: one pure module, one board query group, one Settings tab. Reversibility: remove the module/query/tab; no write path changes. Evidence: spec 18; `src/lib/registry.ts` 4 tests; live registry matched the runs created by the eval and inbound tests.

## D-23: local-os is an opt-in execution provider, never a desktop — 2026-10-28
Trigger: the market/sandbox research on Claude Code's `@anthropic-ai/sandbox-runtime`, and the user's "implement all these stuff". The package is Apache-2.0, wraps arbitrary processes with Seatbelt/bubblewrap/WFP, and needs no Docker or VM. It can close the "the agent cannot run anything" gap for a self-hosted Arova without an E2B key.

Options considered: (A) **opt-in `local-os` provider behind the existing `SandboxProvider` slot**, default off, shell/files only; (B) make it the default provider; (C) keep E2B-only until the desktop works; (D) wrap the model's own tool calls in it. Chosen: A.

Why not B: a shell on the host is high risk; enabling it by default would surprise an operator and violate the "refuse rather than pretend" stance. Why not C: it leaves the execution tier empty when the package can be used safely behind an explicit env switch. Why not D: the model has no tool-calling loop yet; a console a human presses is the honest scope, and the model must not be able to toggle its own boundary.

Implementation: `LocalOsSandboxProvider` capabilities `{graphical:false, pty:true, snapshots:false, takeover:false, persistentHome:true, multiScreen:false}`; per-agent workspace under `.arova/sandboxes/<agentId>`; server-side `srt-settings.json`; network allowlist empty by default; `.env`/credentials denied by path; CLI run through `process.execPath`, not a host shell; `browser`/`stream` refuse; `runSandboxCommand` is a real run + step + audit; `AROVA_SANDBOX_PROVIDER=local-os` turns it on.

Why not the library API: the CLI is one process per command and avoids a global `SandboxManager` lifecycle; the provider can move to the library later if concurrency demands it. Why not a browser: srt can wrap a headless Chromium only with its own sandbox disabled, macOS Chromium is currently broken, and Arova's desktop tier needs GUI/view/takeover anyway.

Cost: one module, one action, one Integrations tab, one test file. Reversibility: unset the env var; the provider is inert, and `disable` is a config change. Evidence: spec 19; `src/lib/sandbox.test.ts` 9 tests; live fail-closed refusal on Windows; config schema accepted; direct WSL2 bwrap primitive passed. A successful command on this host is still unverified until the one-time `npx srt windows-install`.

## D-24: audit export is a narrow JSON, not a database dump — 2026-10-28
Trigger: the registry and run record are visible but not portable; a governance layer must be exportable.

Options considered: (A) **a workspace-scoped JSON of governance rows**, excluding message bodies, channel targets/tokens, keys, session tokens and agent instructions; (B) a full database dump (portable but leaks secrets and content); (C) CSV per table (more files, no provenance links); (D) no export (a dashboard, not a record). Chosen: A.

Why: it is the smallest artifact a human or auditor can read and the exclusions are named in the file and the UI. The 5,000-row cap keeps it from becoming a streaming problem. Content export is a separate decision because message bodies and memory text are the most sensitive rows. Membership, not ownership, governs access: any member who can see the registry can export it, matching the current model.

Cost: one route and one link. Reversibility: remove the route/link; no schema change. Evidence: spec 20; live 200 with the expected keys and no `messages`/`target`/`token`; no cookie → 401.

## D-25: the tool loop is opt-in, read-only and non-streamed — 2026-10-28
Trigger: search and citations were impossible because chat had no tool-calling loop. The user asked to finish the remaining specs/tasks.

Options considered: (A) **an opt-in per-agent loop over the already-granted read-only tools**, with search as a provider-neutral adapter; (B) always-on tools for every agent; (C) a manual search console only; (D) a loop that also includes shell/write tools. Chosen: A.

Why not B: a model calling `web_fetch`/search changes latency and cost for every reply; the existing token-streamed path must stay available. Why not C: a console does not close the grounding gap; the model cannot use the result. Why not D: the seat's approval/effect ledger does not yet gate model-initiated writes, and a shell is a different risk class; read-only is the honest scope.

Why non-streamed: a tool-call turn has no final answer to stream; a single final `delta` after the loop is more truthful than fake token streaming. The composer says "read-only tool loop on · no shell". The loop is bounded at 4 steps, counts every model turn, audits every tool call as `tool.called`, feeds tool errors back, and carries `toolsUsed`/`sources` in the stored message.

Search is configuration, not code: SearXNG/custom endpoints or Brave, with a local-endpoint guard; `web_search` is offered only when a provider is configured and the seat holds `web_fetch`. Sources are numbered and rendered as links.

Cost: gateway types, one pure loop module, one search adapter, a capability flag, a board branch and UI state. Reversibility: turn the per-agent toggle off; the old streaming path is unchanged. Evidence: spec 21; 13 new tests; 232/232; live fixture loop/search/citations with stored sources and audit; UI Sources line and composer note. A real vendor/search endpoint is still unverified.

## D-26: one citation ledger for the whole tool loop — 2026-10-28
Trigger: a defect found while reading the tool loop, before any user report. Each `web_search` numbered its own results from [1], and the UI numbered the deduped source list from [1] again, so after a second search every [n] in the answer named a different page than the model had read. `web_fetch` produced no source at all, and an invented number rendered like a real one.

Options considered: (A) **one loop-wide ledger of unique URLs with stable 1-based numbers**, plus a report of cited/unresolved/uncited computed on the answer; (B) keep per-call numbering and re-number the sources in the UI only; (C) drop numbered citations and rely on bare URLs in the prose; (D) verify that each cited page contains the claim. Chosen: A.

Why not B: the model reads the numbers in tool output, so the truth has to be decided where the model reads it — the UI cannot repair a mismatch it cannot see. Why not C: a source list with no markers cannot show which sentence stands on what, and the honesty contract asks for the opposite. Why not D: that is a reader/reranker, a different feature with its own cost; the report states what is known (returned vs cited), not what is true.

Design: `src/lib/citations.ts` is pure — `addSource` dedupes by URL with the fragment stripped and refuses a number past the cap (12); `citationReport` ignores [0] and code spans/fences and returns `{cited, unresolved, uncited}`. `executeToolCall` takes the ledger so search text and source list share numbers; `web_fetch` returns the final URL and title and its output is prefixed with its number. The report runs on the answer (not the reasoning block) and is stored next to `sources` on both reply paths. The UI prints each source's own index and adds a waiting-coloured line naming every unresolved number.

Cost: one pure module, a field in `ToolExecution`/`ToolLoopResult`, one metadata helper, one UI line. Reversibility: the ledger can be swapped for per-call numbering by deleting the parameter — nothing is persisted in a new shape (sources gain an `index` field; old rows fall back to list position). Evidence: spec 22; 241/241 tests; live fixture proof with a deliberate [9]; Chrome at 1440×900 and 390×844 with `CONSOLE: []`.

## D-27: Stop aborts unary work, but never loses a streamed partial — 2026-10-28
Trigger: the tool loop checked nothing between turns. A reader who pressed Stop kept paying for up to four model turns and every tool call, then a complete answer was stored that they had cancelled — and nothing said a stop had happened.

Options considered: (A) **one AbortController fed by both the stream's cancel() and the request signal, passed to unary model calls; the loop polls shouldStop between turns and tool calls; the gateway never retries a stop; nothing is stored except an audit event**; (B) leave the loop running and discard its answer at the end; (C) abort every provider call, including token streams; (D) remove the Stop button from the tool-loop state. Chosen: A.

Why not B: the wasted turns and tool calls are the cost the button exists to stop, and the discard would still need the same closed-check. Why not C: aborting a token stream throws and loses the partial text the UI already showed, which is the one promise the existing Stop copy makes (“what has already arrived is kept”). Why not D: hiding the control is the honest-UI failure this product forbids.

Design: `streamReply` owns the controller; `leave()` sets `closed` and aborts, fired by `cancel()` and `request.signal`. The router and each tool-loop turn receive the signal. `requestCompletion` combines it with the timeout and rethrows an abort without retrying. `runToolLoop` takes `shouldStop` (checked before each turn and each tool call; a tool already running is finished). A stopped result writes no assistant row and no provider-error row; one `chat.stopped` audit records it.

Cost: one optional field through the gateway and the loop, one controller in the route, one audit type. Reversibility: stop passing the signal and `shouldStop`; the loop behaves as before. Evidence: spec 23; two new tests (one turn after a stop, one fetch attempt after an abort); live fixture proof `{calls:3, delayed:1, aborted:1}`, only the greeting stored, `chat.stopped` present.

## D-28: a brief stops like a chat, and a stopped stream closes its connection — 2026-10-28
Trigger: D-27 gave chat a stop; an org brief still only polled `isClosed` between steps, so a reader who left kept paying for the router and every seat call, and the report was written afterwards. A stopped token stream also stopped reading without closing the provider connection.

Options considered: (A) **the same controller contract for briefs — stop row + `brief.stopped` + run CANCELLED, signal through the router and every seat call — plus `reader.cancel()` when a stream is stopped**; (B) keep polling only, let the brief finish and discard; (C) abort the report stream too; (D) store a provider error on stop. Chosen: A.

Why not B: the summons are the expensive part and the user's Stop means them. Why not C: aborting the report stream throws and loses the partial the reader already saw; closing the reader after the last chunk keeps it. Why not D: a stop is not a provider failure, the same reason D-27 exists.

Design: `streamBrief` owns an AbortController fed by `cancel()`/`request.signal`; `runBrief` polls `stopped()` before the first summons, each routing pass, each seat call and the report, and passes the signal to `routeDecision` and `consultPeer` (recursively). A stop writes one `channel_gap` row with `metadata.stopped`, audits `brief.stopped`, finishes the run `CANCELLED`, and writes neither a "did not answer" gap nor a `provider_error`. Posts already landed stay. `streamText` moved to the gateway as `readSseText`, which cancels the reader on stop while keeping the text received.

Cost: one optional signal through the brief path and `consultPeer`, a hoisted `summons`/`routed` so the outer catch can use the same stop helper, one pure reader function + one test. Reversibility: stop passing the signal; the polling-only behaviour returns. Evidence: spec 23; 244/244 tests; live brief proof `{calls:2, delayed:1, aborted:1}`, stop row, run CANCELLED, one audit; both earlier proofs re-run.

## D-29: history pages on (created_at, id), and search refuses plain http — 2026-10-28
Trigger: the sweep after the stop fixes. Two small gaps with real failure modes. (1) The windowed board paged on `created_at < before` alone; rows inserted in one statement share the timestamp, so at a page boundary the rest of the tied group was unreachable and a seeded thread silently truncated (reproduced: 0 of 50 older rows returned). (2) The search adapter accepted an `http` remote endpoint and would send `SEARCH_API_KEY` as a Bearer header over it.

Options considered: (A) **page on the pair `(created_at, id)` in both query and client, plus refuse non-local http in the search adapter**; (B) add a monotonic sequence column and migrate; (C) page by offset, which is unstable under inserts; (D) leave both. Chosen: A.

Why not B: a sequence is a migration and a second ordering for one edge case; the id is already unique and stable. Why not C: offset paging duplicates or skips rows while new messages arrive, the exact class of bug this windowing already avoids. Why not D: both are silent failures — a truncated thread and a key on the wire.

Design: the window and the pager order by `created_at DESC, id DESC`; the pager predicate is `created_at < before OR (created_at = before AND id < beforeId)`; `beforeId` is optional so an older client still works, and the client computes the oldest row with the same tie-break. The search adapter refuses `http` for any non-local host before any fetch.

Cost: one optional field, one predicate, one client reducer; one line in `buildUrl` and one test. Reversibility: drop `beforeId` (timestamp-only behaviour returns). Evidence: spec 24; `paging-proof.mjs` (200 + 50 = 250 unique, 0 without the id); `web-search.test.ts` proves no fetch on http; 245 tests, typegen/tsc/build green.

## D-30: no home-deny entries on Windows; skip the profile read grant — 2026-10-28
Trigger: after the owner provisioned the sandbox, the app still failed closed and the runtime was unusably slow. Measured causes: (1) our `denyRead` listed `~/.ssh`, `~/.aws`, `~/.config/gcloud`, `~/.azure`, which makes srt-win rewrite the **profile root's** DACL and walk the whole tree — minutes per run on this machine; removing them made the persistent ACL grant finish in under a second; (2) the install's optional profile read grant was left `incomplete`, and any non-`none`/`current` state refuses every session; repairing it rewrote ~900 ACLs (over an hour).

Options considered: (A) **platform-aware deny list (home denies only on non-Windows) and guidance to install with `--skip-profile-grant`**; (B) keep the home denies and accept the walk; (C) grant profile read and keep our denies; (D) drop `.env` denies too. Chosen: A.

Why not B: a per-command multi-minute ACL walk is not a usable sandbox, and on Windows the entries are redundant — the profile grant excludes the credential stores by design, and without a grant the profile is unreadable outright. Why not C: the grant is exactly the slow, risky step this app does not need. Why not D: project `.env` files sit inside a granted read root, so those denies are load-bearing on every platform.

Design: `buildSrtSettings` takes a `platform` (defaulting to `process.platform`) and emits `~/.ssh`, `~/.aws`, `~/.config/gcloud`, `~/.azure` only when not Windows; `.env`/`.env.local` (relative and absolute) stay everywhere. The Sandbox tab states the Windows prerequisite and why the profile grant is skipped.

Cost: one option, one branch, two tests. Reversibility: restore the home entries if a provider ever needs them. Evidence: spec 19's measured section; the debug run showed `acl grant --persistent` completing instantly without the home entries; 10/10 sandbox tests, tsc green. A successful command is still unverified — the host refuses `CreateProcessWithLogonW(srt-sandbox)` with access denied after provisioning.

## D-31: a Windows sandbox workspace lives outside the user profile — 2026-10-28
Trigger: with the recommended `--skip-profile-grant` install, a command from the project directory failed with srt-win's `mapped_drive_cwd` ("C:\ is DRIVE_REMOTE") instead of running. The project sits inside `C:\Users\Ansh`, which the sandbox account cannot traverse without the profile grant; srt-win reports that access failure as a mapped drive. From `C:\Users\Public` the same command passed that check.

Options considered: (A) **default the sandbox root on Windows to `%PUBLIC%\arova\sandboxes`**; (B) require the profile grant so the workspace can stay in the project; (C) copy the project into the workspace per run; (D) tell the operator to set `AROVA_SANDBOX_ROOT` themselves. Chosen: A.

Why not B: the profile grant is the slow, risky step the recommended install skips, and the sandbox has no need for the home directory. Why not C: a copy is expensive and diverges from the workspace the runs record. Why not D: a default that fails on every stock Windows install is not a default.

Design: `defaultSandboxRoot()` returns `%PUBLIC%\arova\sandboxes` on Windows and the existing `.arova/sandboxes` elsewhere; `AROVA_SANDBOX_ROOT` still overrides. Write containment is unchanged — the write-restricted token's capability SIDs, not the parent directory's ACL, are what let the child write its own workspace. The Sandbox tab states the location.

Cost: one helper, one test, one hint. Reversibility: pass `AROVA_SANDBOX_ROOT`. Evidence: spec 19; 11/11 sandbox tests; the same command's failure changed from `mapped_drive_cwd` to the logon refusal (the remaining host blocker) once run outside the profile.

## D-32: the sandbox budget covers initialize; a remote-logon deny is a host limit — 2026-10-28
Trigger: with the workspace moved outside the profile, `initialize()` reached the WFP probe and the app reported only "timed out after 30000ms". The probe has its own 30 s budget and retries, so a 30 s cap kills setup mid-probe and hides the runtime's typed refusal. Measured: the same command completes its ACL work in seconds and fails at the probe after ~77 s.

Options considered: (A) **raise the default budget to 120 s and surface the runtime's refusal**; (B) keep 30 s; (C) separate prepare/execute timeouts; (D) hide the failure behind a friendlier message. Chosen: A.

Why not B: it hides the actionable error and leaves half-applied grants. Why not C: a second configuration knob for one host path; 120 s covers initialize plus a normal command. Why not D: the app's contract is to print what refused.

Also recorded: the installer denies `SeDenyRemoteInteractiveLogonRight` for `srt-sandbox` (strings in the vendored binary). In a Remote Desktop session `CreateProcessWithLogonW` creates the process in that session and the deny right makes it fail with access denied — consistent with the measured refusal, to be confirmed on a console session. No code can work around a Windows logon right.

Cost: one default constant, one assertion. Reversibility: `AROVA_SANDBOX_TIMEOUT_MS`. Evidence: spec 19's post-reinstall section; 11/11 sandbox tests; the app now prints the WFP/`CreateProcessWithLogonW` text. A successful sandbox command remains unverified.

## D-33: a WSL/bubblewrap provider while the Windows runtime cannot start — 2026-10-28
Trigger: the owner asked to use WSL after the Windows sandbox was proven blocked by a Remote Desktop logon right (D-32). WSL2 Ubuntu is present with `bwrap`; Node and socat are not, and installing them needs an interactive `sudo`.

Options considered: (A) **a `wsl` provider that runs each command through bubblewrap inside WSL2**; (B) wait for a console session and the ASRT runtime; (C) install Node+socat in WSL and run the ASRT CLI there; (D) a Docker container per command. Chosen: A.

Why not B: it leaves the execution tier unusable on the session the owner actually uses. Why not C: it needs a sudo install and adds the ASRT proxy layer for a sandbox that, on this host, has no allowed domains anyway. Why not D: a container per command is heavier, needs the Docker daemon's cooperation for nested namespaces, and moves the workspace across a volume boundary.

Design: `src/lib/sandbox-wsl.ts` — `wslBwrapArgs` builds `--unshare-all`, read-only `/`, workspace bind, private `/tmp`, `--tmpfs` over the Linux home and the Windows profile, cleared env; the command is staged as a script in the workspace and run as `bash <script>` (no user text on an argv). Workspace root `/var/tmp/arova-sandboxes`; budget 120 s; `AROVA_SANDBOX_PROVIDER=wsl`.

Honest limits, stated in the UI: network is absent rather than allow-listed (no proxy), there is no seccomp monitor and no snapshot, and the command runs as the WSL user in namespaces rather than as a separate account.

Cost: one module, one provider branch, five tests, two live scripts. Reversibility: unset the env var; `local-os` and the unconfigured provider are unchanged. Evidence: 5/5 unit tests; live API proof (echo, profile hidden, network unreachable, read-only root, empty Linux home, five runs/audits); real Chrome Check prints `arova-sandbox-ok` with `CONSOLE: []`.
