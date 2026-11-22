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

## D-18: The code is the authority — context sync — 2026-10-20
Trigger: The user asked for the project-context-system to be "completely" implemented and the project context to describe the app properly. A read-only audit compared every context file with `src/`; the repo has moved five commits past the last handoff (`c7db7f5`), and several documents still described the pre-commit tree or the superseded Studio Edition.

Options considered: rewrite the docs from the code / preserve the old handoff as history and add corrections / regenerate only the missing files.
Chosen: rewrite the always-read files (overview, architecture, build-plan, code-standards, library-docs, progress tracker, memory) from code evidence, correct factual counts in README/PRODUCT/.env.example/specs, and keep dated history inside the tracker rather than deleting it. Missing scaffold files (`current-issues.md`, `CLAUDE.local.md`, `designs/`, `screenshots/`) were added.
Lost alternative: patching single lines — the documents had accumulated contradictions (committed vs uncommitted, Studio vs Graphite, 151 vs 153 tests, 14/4 vs 15/6 tools, default 1 vs 2 delegations), and line patching would leave a reader unsure which half to trust.
Lost alternative: changing code to match docs. Run Now, routine lateness and `MODEL_MAX_TOKENS` are code/behavior mismatches, not documentation typos; changing behavior without the user's decision would be scope creep and could spend real model calls.
Cost paid: one documentation pass; three mismatches remain visible in `current-issues.md` instead of being hidden.
Reversibility: easy — documentation only, no runtime behavior changed.
Correctness policy: **a document may describe intent, but must label it as intent; a claim about current behavior must be backed by code.** The audit found:
1. Run Now is a `WAITING_FOR_TOOL` stub, not an execution path.
2. Due routines tick on board `GET` only; no `missed`/late status is written.
3. `MODEL_MAX_TOKENS` reserves history; output is bounded by `tokenBudgetFor`/capabilities.
4. Feature 15 is env diagnostics only; no login flow exists.
5. `MAX_DELEGATIONS` defaults to 2; the tool registry is 15 tools with 6 live.
6. `npm run lint` is clean as of this pass; the earlier L-01 note was stale.
These are recorded, not silently resolved. The sync only edited documentation; any code change still needs a spec and the user's approval.

## D-19: Market position and roadmap sequence — 2026-10-20 (PROPOSED, pending approval)
Trigger: the user asked for end-to-end market research against Grok Bot, OpenAI Dots, OpenDots, OpenBot, OpenMuse and the wider category, then a gap analysis and multiple feature specs. Fifteen products were read from official sources (`context/market-comparison.md`).
Options considered (positioning): A) chase full parity on the agent computer and always-on runtime; B) become the **accountable agent organisation** — self-hosted, model-agnostic, org-native — and integrate the substrate; C) become a personal assistant like OpenMuse/OpenClaw.
Proposed: **B**, because Arova already leads on the combination no reviewed competitor has (explicit org structure + reviewable memory + provenance + BYOK), while A/C are crowded and capital-intensive. Chosen provisionally, not final until the user approves.
Lost alternatives: A — competing with Grok Bot/Dots on their strongest axis would require a VM/browser fleet, 24/7 operations and a model budget, and would still leave Arova behind on connectors and distribution. C — OpenClaw/OpenMuse own local-first personal assistant mindshare; Arova's org model would be wasted.
Options considered (sequence): build memory/channels first / build the computer first / build the work substrate first. Proposed: **work substrate first** (specs 16–18: durable worker, tool/policy plane, auth), then scale/memory (19–20), then reach/proactivity (21–22), then skills and computer (23–24). Reason: every other feature depends on durable execution and a safe tool boundary; building UI on top of a fake runtime would repeat the problem specs 16 and 19 exist to fix.
Cost paid: nine specs to review; two processes (web + worker); new infrastructure (queue table, MCP adapters, auth, possibly a sandbox provider). No code written yet.
Reversibility: easy at this stage — the comparison and specs are documents; no schema, dependency or runtime decision has been made. Spec 24 (computer) is deliberately last and optional.
Correctness policy: a capability is described as present only when the corresponding spec is implemented and verified. Until then, the honest-refusal states stay. Vendor claims in the comparison are sourced and dated, not treated as benchmark results.
What the user must decide: approve/decline the positioning (B), and approve the first spec. Recommendation: approve B and start with spec 16 (durable work engine), then 17 and 18.

## D-20: Deep market pass changes the sequence — 2026-10-20 (PROPOSED, pending approval)
Trigger: the user asked whether pass 1 was complete and approved a deeper dedicated study. Six parallel clusters returned enough evidence to correct the first pass.
Options considered: keep the nine-spec roadmap / expand coverage but sequence the same / resequence around trust controls. Chosen proposal: **resequence around local credibility and trust**.
Evidence that forced the change:
- Demand: invisible sub-agent spend, fake pause, credit opacity, trapped artifacts, and credential/exfiltration incidents are stronger pain signals than missing org features.
- Architecture: OpenBot validates one Postgres work-item queue with `SKIP LOCKED`, leases, fail-closed policy, two-row audit and initiator assertions.
- Enterprise rails: AWS temporal policy makes single-use expiring approval the right model; Microsoft/Google normalize registry/gateway/audit but are too heavy for Arova.
- Memory: Devin Git-backed Markdown and Lindy versioned files prove reviewability matters more than a hidden vector claim; Mem0/Zep/Letta are wrong rails.
- Computer: E2B is the sensible production terminal/files adapter; Browserbase for managed browser takeover; Daytona's archived OSS repo disqualifies it as a self-host default; Docker is dev adapter.
- Open-source dependencies: OpenDots/OpenMuse/OpenBot lean on licensed CopilotKit Intelligence or SQLite/PGlite in ways that split source of truth; Arova should remain Postgres-native.
Options considered and rejected:
1. Start with agent computer or connectors — rejected because it raises blast radius before auth, policy and pause exist.
2. Add Mem0/Zep — rejected because they move memory out of the user's auditable Postgres boundary.
3. Use Redis first — rejected because Postgres can provide leases/audit at this scale and Arova's accountability claim wants the queue itself queryable.
New artifacts: spec **25 local development bootstrap** and spec **26 trust/cost/artifact controls**; specs 16–24 amended with dated decisions.
Cost paid: another documentation layer and a more complex first wave; one table cluster and worker/policy surfaces when eventually built. No code changed yet.
Reversibility: easy now—documents only. After spec 16/26, lineage/approval tokens become harder to remove, so their schema should be designed once.
Correctness policy: proposed roadmap may be ambitious; product claims may not. Until specs are implemented and verified, Arova remains no worker/no tools/no auth/no computer.
Pending user decision: approve D-20 sequence and start with spec 25.

## D-21: Start implementation with spec 25 local bootstrap — 2026-10-25 (APPROVED by the user)
Trigger: after the pass-3 market refresh and spec audit, the user said "start the implementation". Per D-20's recommended order, that begins with spec 25.
Options considered: start with spec 16 (worker) / spec 18 (auth) / spec 25 (bootstrap). Chosen: **25**, because every other roadmap feature needs a verified project-owned database, and the audit confirmed `drizzle.config.ts` still carried the hardcoded fallback the spec names for removal.
Implemented this session (code complete, live steps pending):
1. `src/lib/db-check.ts` — pure ownership classifier (`empty | arova-only | foreign`), 15-table list, `missingArovaTables`; test-first (RED confirmed, then GREEN).
2. `scripts/db-check.ts` + `npm run db:check` — read-only check: prints `current_database()` + server version + public tables, classifies, exits 1 on `foreign`, 2 on missing DATABASE_URL/connection failure. Never mutates.
3. `drizzle.config.ts` — fallback removed; requires `DATABASE_URL` with a named instruction; loads `.env.local` over `.env` to mirror Next.js precedence (a real gap found: drizzle-kit previously could not see `.env.local` at all).
4. `.env.example` — database section updated (recommends `arova_local`, documents `db:check`).
Lost alternative: orchestrating a `npm run setup` (spec 25 open question 2) — rejected for now per the spec's own recommendation; documented commands are enough first.
Correctness policy: push cannot run without DATABASE_URL; `db:check` refuses `foreign` with exit 1. Live verification (db:check against real Postgres, push, health 200, empty first visit, browser) is **blocked on the user creating `.env.local`** and is recorded as not verified.
What the user must do: create the database/role (spec 25a), put `DATABASE_URL` in `.env.local`, then run `npm run db:check` → `npx drizzle-kit push` → `npm run db:check` → `npm run dev`.

## D-22: Roadmap approved; spec 16 durable work engine implemented — 2026-10-25 (APPROVED)
Trigger: the user said "keep on building all the things until you are done with all of them" — taken as approval of the D-20 sequence (16 → 26 → 17 → 18 → 19 → 20 → 21 → 22 → 23 → 27). A clarifying question about "go with vite plus" was answered **keep Next.js**; the stack is unchanged.
Implemented for spec 16 (code complete, gates green: 168/168 tests, typecheck, lint, build):
- **Schema:** `jobs` (spec 16a, plus a `run_id` link column the spec did not name — needed so `cancelRun` can close a running job's row) and `worker_heartbeats`.
- **Pure rules** in `src/lib/jobs.ts` (test-first, RED confirmed): terminal immutability, backoff with jitter (0.5–1.5×, 5 min cap), `afterFailure` retry/dead-letter, lease claimability, per-occurrence idempotency keys, worker staleness (90 s).
- **Worker:** `src/worker/index.ts` via `npm run worker` — `FOR UPDATE SKIP LOCKED` claim with DB-clock lease, concurrency 1 (env `WORKER_CONCURRENCY`), poll 5 s, heartbeat, graceful shutdown. Runs outside Next, so `scripts/worker-loader.mjs` resolves the app's `@/` alias and maps `next/server` → `next/server.js` (bare `next/server` does not resolve in plain Node).
- **Request paths:** board tick claims by predicate then enqueues (`occurrenceKey` dedupes per scheduled moment); Run Now enqueues `manual_run` (the stub is gone); `POST /api/trigger` returns **202 {jobId}**; `cancelRun` closes queued/running jobs under the run; the worker executes with the same `executeRoutine`/`runBrief` code.
Deviations from the spec text, each deliberate: (1) the 202 returns `{jobId}` only — `runId` does not exist until the worker's claim creates the run, so promising one would fabricate an id; (2) a claimed routine's `lastStatus` is `QUEUED`, not `RUNNING` — showing "running" with no lease would be the fake state spec 16e forbids; (3) a person-initiated run never moves the fatigue streak (the rule exists for schedules failing unattended, and Run Now executing is new behavior the rule never met); (4) a budget stop (`WAITING_FOR_TOOL`) maps to job `RETRYING` with backoff, not terminal failure; (5) trigger idempotency keys are minute-bucketed, so a webhook retrying within one minute queues one brief.
Lost alternative: moving `executeRoutine`/`runBrief` out of the route file into a shared lib — rejected this pass; the route already exports `runBrief` for the trigger route, the loader reuses that seam, and a 1,500-line refactor without a live database to verify against would risk the two-reply-paths invariant for no behavioral gain. Recorded for reconsideration at spec 19 (route thinning).
Cost paid: a second process per deployment, two tables, one resolve hook. Live execution, the 202 path, retry-after-kill and the worker UI are **not verified** — they need the user's `DATABASE_URL` and a pushed schema. The board also now requires the two new tables: run `npx drizzle-kit push` after `db:check` before first load.

## D-23: Spec 26 first slice — token boundary and queue pause/kill — 2026-10-25 (APPROVED sequence)
Trigger: continuing the D-22 sequence with spec 26. The full spec spans 26a–26h; this session shipped the two slices that are real against what already exists, and deliberately deferred the rest.
Shipped:
1. **Trigger tokens hashed (26e; closes current-issues #17).** `triggers.token` now stores a sha-256 digest; `tokenPreview` (first 8 + last 4) is the only display value; the board payload no longer ships the digest at all. `POST/GET /api/trigger` look up by digest. The raw token exists in the browser exactly once — in the creation response — and the trigger panel shows a one-time copyable call line with a dismiss; the old persistent curl-line-per-row UI is gone. Losing the token means revoke + recreate, and the UI says so.
2. **Queue pause and kill (26c, minimal-but-real).** `workspaces.paused_at` stops the worker's claim (`JOIN workspaces … paused_at IS NULL`); a running lease finishes its current step. New actions `pauseWork` / `resumeWork` / `killJobs` (kill cancels QUEUED/RETRYING/RUNNING jobs for the workspace; a running run still closes through the existing CANCELLED predicate). Settings › Workspace gained the paused/running switch and the kill control.
3. **Pure rules for the approval token (26g)** in `src/lib/policy.ts`, 9 tests: `argumentsHash`, `approvalExpiry` (10-minute unattended window), `tokenVerdict` (single-use, expiring, argument- and target-bound, refusal names its reason), `hashToken`/`tokenPreview`, the autonomy dial's `canPropose` (high widens interactive iteration only, never unattended), `UNATTENDED_CAP = 1`.
Deliberately deferred, with the reason: the `approval_tokens` table, budgets hierarchy rows, `runs.parent_run_id`, artifacts (26d), the credential vault and egress rules (26e/26f) and the run trust panel (26h) all have their **consumer in spec 17's tool gateway** (or spec 27's change requests). Building their tables now would recreate the dead-`connections`-table problem the 2026-10-25 audit flagged (issue 18). Sequencing: 26's remaining surface lands with 17, where every rule gets a caller. The pure rules are already pinned and tested so 17 inherits decisions, not blanks.
Not verified (needs the user's database): digest lookup against a live token round-trip, the paused-workspace claim exclusion (the SQL uses `FOR UPDATE OF jobs SKIP LOCKED` — valid Postgres, unrun), pause/kill actions, and the new Settings/trigger UI at both breakpoints.

## D-24: Spec 17 first slice — the policy gateway and its pure core — 2026-10-25 (APPROVED sequence)
Trigger: continuing the D-22 sequence with spec 17. The spec's own unit-verification list is exactly the DB-free testable surface, so that shipped first.
Shipped:
1. **Policy decision matrix (17b)** extended in `src/lib/policy.ts`: `decideToolCall` is fail-closed (missing grant denies before anything else is consulted; plan mode denies non-reads; unattended work is capped at reads and can never approve a write; `web_fetch` runs the SSRF guard; a WRITE with an explicit grant is "pre-approved by grant"; everything else — including every unannotated MCP tool — asks). 19 policy tests now pin the matrix.
2. **SSRF guard** `assertFetchableUrl`: http(s) only, private/loopback/metadata addresses and `.internal`/`.local`/`metadata.*` hostnames refused, exact-or-subdomain allow-list when `TOOL_ALLOWED_HOSTS` is set (and no allow-list still refuses private ranges).
3. **Credential vault crypto (17e)** `src/lib/credentials.ts`: AES-256-GCM envelopes (`v1:iv:ct:tag`), fresh IV per seal, wrong-key/tamper failures, and a missing/malformed `CREDENTIAL_ENCRYPTION_KEY` refuses loudly instead of falling back to plaintext. 5 tests.
4. **MCP client core (17c)** `src/lib/mcp.ts`: JSON-RPC request builders, discovery parsing (`tools/list`), the concrete safe default (unannotated MCP tool → WRITE → approval), text-result extraction, and argument redaction for audit. 6 tests.
5. **Audit tables**: `tool_calls` (decision + rule + redacted args + args digest + status) and `credentials` (envelope only, no read path). `save_note` is the first tool through the gateway: `saveMemory` now decides via `decideToolCall` and writes a before-row and an after-row, with the deny paths producing the same sentences the inline checks used to throw (no behavior change).
6. Registry (17a): every tool now carries a risk class; `web_fetch` keeps its honest refusal until model-invocation wiring exists.
Deliberately deferred to the next 17 step (recorded, not skipped): the model-initiated tool-call loop in both reply paths (which flips `web_fetch` truly live and consumes approval tokens for MCP writes), the MCP transport caller (streamable HTTP against a real server), the credentials actions, and the UI status surfaces. The plane is built and pinned; the wiring that lets a model reach it is the next unit, and it is large enough to deserve its own session.
Not verified (needs the user's database): `tool_calls` rows landing on real saveMemory calls (allowed, denied, plan-blocked), the tables existing after push, and the board carrying no credential bytes.

## D-25: Local database is live — dedicated instance, user-delegated setup — 2026-10-25 (APPROVED by the user)
Trigger: the user said "use our local database only, and fill .env.local yourself." That explicitly delegated spec 25a's human-only boundary to the agent, so this record documents what was done and why each step was chosen.
What was found: the shared Postgres on 5432 requires scram-sha-256 for every connection, the user does not know the superuser password, and no pgpass file exists. Rather than guess credentials into another project's instance, Arova got its **own dedicated instance**: `initdb` at `~/arova-pg/data`, user `arova` with a generated credential, port **5544**, bound to 127.0.0.1 only. Port 5433 was tried first and abandoned — another application's postgres already holds 127.0.0.1:5433, which our instance only discovered by failing to bind IPv4.
- `.env.local` was written by a script directly from the generated secret; the password never appeared in chat or a transcript, and the intermediate pwfile was deleted. `npm run db:start` (scripts/db-start.cjs) cold-starts the instance.
- **The full spec 25 sequence ran live**: `db:check` EMPTY → `drizzle-kit push` (19 tables) → `db:check` AROVA-ONLY (the check caught its own 15-table list being stale — fixed and re-tested) → health 200 `{ok:true, worker}` → empty first visit (0 agents/messages/routines/runs).
- **Spec 16 verified live, end to end**: Run Now enqueued a real `manual_run` job (no stub); the worker claimed it, executed, and the run closed FAILED with the honest "no key on this server" sentence, the job retrying with backoff and dead-lettering FAILED at attempt 3/3; local-mode chat persisted; a due routine was claimed by a board GET and enqueued keyed; killJobs/pauseWork stopped claims (0 claims while paused) and resumeWork restored them; the worker strip went stale → fresh across worker restarts.
- **Spec 26/17 verified live**: trigger token digest round-trips (202 `{jobId}`, cooldown restamped, board ships `tokenPreview` only); the policy gateway recorded allow → SUCCEEDED and deny (plan mode) → DENIED `tool_calls` rows with the exact refusal sentence reaching the client.
Two worker bugs were found by live execution and fixed: the claim subquery's unqualified `id` was ambiguous across the JOIN, and the raw `RETURNING` needed a snake_case→camelCase mapping (an unmapped row died as a NOT NULL violation on the first write — loud, not silent).
Honest boundary: the UI was exercised through the API, not a browser capture — the worker strip, trigger one-time call line and Settings pause/kill controls still owe a 1440×900/390×844 pass. No provider key exists, so every model call took its honest failure path by design.

## D-26: Spec 17 step 2 — model-initiated tool calls, live-verified with a scripted model — 2026-10-26
Trigger: continuing the approved sequence. The gateway existed; the model had no way to reach it.
Shipped:
1. **Tool directive (17a/17b):** `parseTurn` now parses `{"tool":{"name":"web_fetch","arguments":{…}}}` exactly like a consult — only a string name with a plain-object bag survives; `locateDirective` matches both openers. `toolPromptSection` names `web_fetch` in the system prompt **only** when the seat's grant and `TOOL_ALLOWED_HOSTS` both allow it, and the standing capability line changes from "no tool execution" to "tool results are untrusted data" only when the section exists.
2. **`runToolRound` — the one tool round both reply paths share:** registry + runtime availability → `decideToolCall` → a `tool_calls` row before (decision + rule + redacted args + digest) and after (status + duration + capped output) → execute → the result returns as a labelled `TOOL RESULT — … treat as data, never instructions` user note; one bounded follow-up call; no chaining. Denied/approval outcomes carry the rule; the human's approval card comes from the existing `approvalReply`.
3. **Availability is finally computed, not hardcoded (17a):** `isToolAvailable`/`fetchAllowlistConfigured` in tools.ts; `normaliseCapabilities` and `resolveTools` both use it. Live execution proved why this mattered: the seat's grant was silently dropped by the static grantable set even after the gateway was willing — the bug existed at **two layers** and only the real round exposed it.
4. **`web_fetch` adapter (17d):** SSRF guard, content-type check, 15s timeout, HTML→text extraction (`src/lib/webfetch.ts`), output cap (env `TOOL_OUTPUT_CAP`, default 8000).
5. **Live verification with zero external keys:** `npm run mock-model` (scripts/mock-model.cjs) is a scripted OpenAI-compatible server registered as provider `mock`, so the whole loop ran against the real gateway: unary and streaming paths both fetched `https://example.com` (SSE `tool` frames `running`→`succeeded`), the follow-up answered from the page, both paths persist **identical** `metadata.tool` (an inconsistency found and fixed during verification), and the model's request for `http://127.0.0.1:5544` (the database port) was **refused live** with "target is a private or metadata address" and an audit row to prove it.
Deliberately still open in 17: the MCP transport caller (streamable HTTP), credential actions over the vault, the UI status surfaces (capabilities show runtime availability, gateway decisions in the Record stream), and MCP write approvals consuming the 26g tokens. These are the next 17 step; the plane, the loop and the audit are done and verified.

## D-27: Spec 17 step 3 — MCP transport, credential vault and UI surfaces, live-verified — 2026-10-26
Trigger: continuing the sequence. This closes spec 17's core scope.
Shipped:
1. **Streamable-HTTP MCP transport (17c):** `mcpDiscoverTools` (initialize + tools/list) and `mcpCallTool` over self-contained POSTs — stateless v1, no session id persisted, so a session-requiring server fails honestly at discovery. The SSE-response parser is unit-tested; a malformed or non-http server URL is dropped at normalisation.
2. **MCP tools through the gateway:** a seat's http servers contribute tools named `mcp:<server>:<tool>`; discovery at round time classifies the risk from the server's own annotations (unannotated → WRITE) and refuses a name the server does not expose. **Live-verified with `npm run mock-mcp`:** the annotated read ran (allow → SUCCEEDED, answer built on the server's text) and the unannotated write **paused for approval** — after a real bug was caught live: the first attempt slipped through as "pre-approved by grant" because seat-level server config was treated as pre-approval; configuring a server is reach, never pre-approval, so MCP writes always ask.
3. **Credential vault wired (17e):** `storeCredential` (AES-256-GCM seal, rotation = same-label upsert) and `deleteCredential`; the vault's only reader is `vaultAuthorization`, which turns a server's credential label into an Authorization header at call time. **Live-verified end to end:** the mock MCP server echoed `Authorization: Bearer super-secret-value-123` from a stored credential, while the entire board payload shipped only the label — zero value leakage. Honest note: tool *output* is not scanned for secrets (the mock echoed ours by design); argument redaction covers the args side.
4. **UI status surfaces (17f):** the capabilities dialog now shows web_fetch as live exactly when the allow-list exists (threaded as a prop from the board's `toolEnv`), the MCP server rows show url + credential with an "http · gateway-gated" state, `mcpSummary` says servers run through the gateway, and the Integrations pane gained a Credentials tab (sealed, never displayed again; delete = revoke). `discoverMcpTools` feeds the prompt: unreachable servers are simply absent from the prompt and honest in the UI.
5. **Unattended honesty:** a scheduled run that emits a tool directive has it stripped with an honest note and a `tool.refused` audit event — schedules cannot execute tools in this build, and the row says so.
Deferred to a later pass: per-tool MCP allow-lists (the server-config-is-the-grant model stands until then), SSE session handling, and the Record-stream rendering of gateway decisions.

## D-28: Spec 19 first slice — bounded board, cursors, limits, retention sweep — 2026-10-26
Trigger: continuing the sequence. Spec 19's full scope (per-thread page state in the client, route-level test suite, diagnostics pane, run-cost rollups) is larger than one pass; this slice ships the parts that make a growing workspace survivable, all live-verified.
Shipped:
1. **Board is bounded (19a).** Every list is capped (messages 200, runs 200, steps 400, approvals 100, memories 300; events/delegations already were) and the board payload carries `pages.messages {truncated, oldestCursor}`. **The overview counters moved to SQL counts**, so a bounded page can never make them lie — verified live: 225 real messages today reported while the page showed 200.
2. **Keyset pagination (19a):** `src/lib/pagination.ts` — base64url (at, id) cursors, isomorphic (no Buffer — the client encodes too), junk decodes to null. `GET /api/board?page=messages&agentId|teamId=&before=&limit=` returns one bounded slice oldest-first with `hasMore`/`nextCursor`. **Live-verified with 225 seeded messages:** page rows had zero overlap with the board page, cursor chaining worked, and a junk cursor / missing subject failed closed with 400s.
3. **Client load-more:** "Load earlier messages"/"Load earlier posts" buttons in the thread and channel, merging deduped by id.
4. **Indexes (19c):** `messages(workspace_id, agent_id, created_at)`, `messages(workspace_id, team_id, created_at)`, `runs(workspace_id, started_at)`, `events(workspace_id, created_at)` — pushed live. (A scripted regex briefly corrupted the schema file; caught by typecheck and repaired.)
5. **Limits (19e):** `src/lib/limits.ts` sliding-window limiter (unit-tested with an injected clock); board mutations 120/min per workspace, trigger 10/min per IP. **Live-verified:** call 13 of a trigger hammer got the limiter's own 429 ("Too many calls from this address"), distinct from the per-token cooldown's.
6. **Retention (19b), opt-in:** `retentionCutoff` (off at 0/unset — tested) and a worker sweep for `RETENTION_EVENTS_DAYS` / `RETENTION_USAGE_DAYS`, documented in `.env.example`, default off, never touching messages/runs/memories. Verified: zero sweeps while off.
Deliberately deferred in 19 (each its own pass): per-thread client cursor state (the current merge is by subject, good to thousands), route-level tests on a disposable database (19f — the last "pure lib only" gap), the diagnostics pane and per-run cost rollups (19d — traces exist as `runs`/`run_steps`/`tool_calls`/`model_usage` rows; the pane that assembles them is UI work), the failure taxonomy, and archive/export before delete.

## D-29: Spec 20 first slice — hybrid Postgres-native recall and temporal validity, live-verified — 2026-10-26
Trigger: continuing the sequence. Spec 20's amended scope (2026-10-25) put Postgres-native fusion before any embedding dependency; this slice ships exactly that.
Shipped:
1. **pg_trgm installed live** on `arova_local` (the role owns the database and the extension is trusted). A one-shot probe gates the hybrid query: without the extension, recall degrades to keyword-only — the UI/prompt never claims more than the database can do.
2. **Hybrid retrieval (20a):** `recallMemories` now queries keyword match **OR** trigram similarity > 0.2, and blends `similarity` into the pure score (weight 1.5, below an exact keyword hit's rank). **The threshold is calibrated from live measurements, not vibes:** whole-sentence similarity peaked at 0.293 for a true match against a ~0.07 noise floor, so 0.3 missed it and 0.2 separates cleanly. **The fuzzy path is proven live with a zero-lexical-overlap probe** ("the port our instance listens at" — keyword clause false, similarity 0.316) retrieving the database-port note.
3. **Temporal validity (2026-10-25 amendment):** `memories.valid_from`/`valid_to` columns; exclusion by SQL query (lapsed or not-yet-open notes are not candidates, pinned included) and by the pure selector, so both layers agree. **Verified live in both directions:** expiring the weekly-reports note removed it from retrieval for a matching question; clearing `validTo` restored it. `updateMemory` accepts `validTo` (ISO instant, null re-opens). The expiry UI lands with the memory-panel rework.
4. Pure layer (215 tests): `memoryScore` blends similarity; `selectMemories` drops lapsed notes alongside superseded ones.
Deferred in 20 (each its own pass): scopes org/team/seat (20b), automatic capture candidates from briefs via the worker (20c — the existing distil path remains the human-in-loop capture), the evaluation fixture set (20f), Git-backed export.

## D-30: Spec 21 Slack-first channel gateway — live-verified end to end — 2026-11-03
Trigger: continuing the sequence. Slack first per the spec's own recommendation; email waits for a provider decision (open question 2).
Shipped:
1. **Connections model (21a):** `channel_connections` (kind, sealed envelope for botToken+signingSecret via the spec 17e vault, externalId, allow-listed senders, mapped org, lastEventAt) and `channel_events` (unique connection+event_id — the idempotency claim). The board payload carries names and status only; the envelope never crosses to the browser (verified live: zero leakage of the token or the signing secret in the full board JSON).
2. **Webhook ingress (21b):** `POST /api/channels/slack` — verify-then-act: the signing secret comes from the connection the (unverified) team_id maps to, and nothing runs until `verifySlackSignature` passes (HMAC, ±5-minute freshness, timing-safe compare). url_verification echoes the challenge only when signed. **All six rules verified live** via `scripts/slack-gateway-smoke.mjs` against the real endpoint: signed challenge echo; an allowed sender's @mention returned 202 and enqueued a durable `trigger_brief`; the same event_id redelivered was acknowledged as a duplicate (the unique insert is the claim); a stranger got the refusal, never a brief; a tampered body was 401; an unknown workspace id was 404.
3. **Identity (21d, honest boundary):** the sender allow-list IS the identity boundary until spec 18's members exist — a member-mapping column is deliberately absent; when 18 lands, the mapping joins there. Unknown senders are refused with an audit trail, matching 21d's refusal half exactly.
4. **Outbound projection:** the worker's trigger_brief branch posts ONE final report into the mention's thread (spec open question 4's recommendation: acknowledgement + final report, no live edits). A first live run exposed a real bug — the delivery fired on every retry attempt — fixed by having `finalize` return the terminal status and speak only on it (a RETRYING attempt says nothing; its successor speaks). **Verified live:** the worker claimed the brief, the lead ran, and the report landed in the mock Slack's channel with the correct bearer token.
5. **UI (21e):** an Integrations "Channels" tab — live/off state, external id, mapped org, sender count, last event, revoke; a connect form (name, token, signing secret, team id, org mapping, allow-list). Secrets are typed as passwords and sealed on save.
Verification harness: `npm run mock-slack` records every postMessage (the gateway's API base is `SLACK_API_BASE`-overridable, unit-tested). Ops note: the dedicated Postgres instance crashed mid-pass (a zombie postmaster held the port); it was diagnosed by process tree, killed surgically (only arova-pg processes — the shared 5432 instance untouched), cold-started, and the channel tables re-pushed.
Deferred in 21: the email adapter (21c — needs a provider choice from open question 2), approval buttons inside Slack (they need 26g tokens executed against real tools), thread-to-channel continuation mapping beyond the first mention, and the member identity join (18).

## D-31: Spec 22 first slice — goals, watches and the attention inbox, live-verified — 2026-11-03
Trigger: continuing the sequence. This is the cheapest "always-on" value before spec 24, riding the durable queue.
Shipped:
1. **Goals (22a):** `goals` with cadence/status/last/next check; create, pause/resume, achieved/abandoned, delete. Creating a goal is a human act.
2. **Watches (22b):** URL watches through the exact web_fetch policy — creation is gated by the same SSRF guard, so a private-URL watch is refused at creation with the rule named (verified live against the metadata endpoint). Conditions: changed (hash baseline — the first check records and says nothing), contains, not_contains; `contains`/`not_contains` without a comparator are refused. Due watches are claimed by the board tick (predicate rule) and enqueued as `watch_check` jobs.
3. **Attention items (22c):** deduplicated on `(workspace, kind, dedupe_key)` where the key pins watch+condition+observation hash; an open twin's `last_seen_at` bumps instead of spawning a second item (verified live: repeated checks kept exactly one `watch_change` item); a dismissed or resolved twin may re-alert as a new event.
4. **Failure ladder (22d):** one message on the first failure, silence after, pause on the third consecutive — mirroring the routine fatigue rule. **Verified live** against a dead path: first failure raised one attention item with the error as evidence; the third paused the watch (enabled=false) with an urgent item; a check queued against the paused watch did nothing and said nothing.
5. **UI (22e):** an Automations Goals tab (goals + watches + builders), the activity board's Needs-attention section carrying the inbox with Seen/Dismiss, and the rail badge counting approvals + open attention.
6. **A real bug found and fixed by live verification:** the overview destructure had drifted one name against the query order when the spec-22 queries were inserted — the attention count was landing in `messagesToday` (reported 1 in a workspace with zero user messages) and `openAttention` was reporting the approvals count. The fix re-aligned the names to the query order and both counters were re-verified honest.
Deliberately deferred in 22: quiet hours and the daily digest (they matter when a delivery channel is configured; the inbox is in-app only for now), mcp_query/email_query watch sources (email waits for 21c's provider), agent-proposed goals as proposal cards (needs the spec 27 card surface), per-workspace retention for observations.
