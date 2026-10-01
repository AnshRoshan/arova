# Feature parity — Grok bot and OpenAI Dots vs Arova

Purpose: an outside-in check on what this workbench is missing. Two products were researched as of
**2026-10-01**: xAI's **Grok** (assistant + agent surfaces) and OpenAI's **Dots** (the always-on agent
feature inside ChatGPT, which is the "ChatGPT alternative to the Grok bot" the comparison is about).
Section 1 is ours and is read out of the code, not out of the specs, because a spec describes intent and
the schema describes what exists.

Status of this document: §1 complete. §2 (Grok) and §3 (Dots) land from the research passes; §4 is the
matrix; §5 ranks the gaps and §6 turns the top one into a spec. §7 adds a third reference, same date:
**OpenBot** (CopilotKit), read from its repository and docs rather than from press.

---

## 1. What Arova does today

### Identity and workspace
- One **workspace** per browser session, identified by an httpOnly cookie. This is a demo identity, not
  authentication: no accounts, no memberships, no roles beyond the creator/lead tier, no sharing URL.
  Name and timezone are editable and the rename is an audited mutation.
- Four-column shell: permanent icon rail · section panel titled by what it holds · work surface ·
  activity board. The app reopens on the last conversation (`localStorage`), not on a dashboard.

### Models and the gateway
- **Env-driven providers**: `PROVIDERS` plus `<NAME>_BASE_URL` / `_MODEL` / `_API_KEY` / `_MAX_CONTEXT`.
  Adding a vendor is a config edit; neither the gateway nor the picker changes. `auto` resolves to the
  first configured profile; `local` answers honestly with no model call.
- **Streaming** with a Stop that keeps what arrived (the partial is stored and labelled, never replayed);
  a separate stream ceiling from the unary timeout; bounded retries before a stream starts; a slow-reader
  backpressure fix; reasoning blocks captured, folded and labelled rather than deleted; a provider's
  `length` stop shown as "budget reached", not as a finished answer.
- **Token accounting**: reported counts when the server sends them (`stream_options.include_usage` with a
  one-shot fallback), otherwise a ~4-char estimate that says "(est.)"; per provider/day rows with an
  `estimated` flag; a **daily call budget** (`DAILY_MODEL_CALLS_LIMIT`) checked at every call site —
  including the routing pass, which is a real vendor call.

### Seats (agents)
- CRUD, pause/resume (pausing disables their routines), avatar/role/instructions, provider choice, soft
  delete. Per-seat identity is three measured tints plus a glyph — never a status colour.
- **Capabilities** are one place: tool allow/deny lists, permission mode (`plan` blocks writes but not
  reading or delegating), per-target consult/handoff allow-lists, effort → real output-token budget,
  temperature/max-tokens overrides, MCP server entries (metadata only — no transport yet), and **skills**
  which are prompt packs that grant nothing.
- Removing a capability removes the option from the model's own prompt, so a tool the user took away
  cannot be improvised back.

### Organisations
- Teams with **reporting lines** drawn from stored `manager_id` (a tree, not a label), a reviewed 10-seat
  template, and model-designed org charts that a human confirms before any seat exists.
- **Permission tier**: a designated creator seat is the only seat that may found an organisation on its
  own behalf; an org's lead may staff inside its own org; refusals name the rule and the seat that can
  actually do it. Null designation = no tier in force (pre-Feature-11 behaviour, kept deliberately).
- **Hermetic reach**: a seat may consult only seats in its own org, and channel history is org-scoped.

### Delegation and the channel
- `consult` (asker keeps the floor and must weigh the answer, not paste it), `handoff` (the turn moves and
  is billed to whoever answered), each hop a `delegations` row with question, answer, model and tokens;
  `MAX_DELEGATIONS` ceiling; visited-set guards so a chain cannot loop.
- The **org channel**: a brief to the lead is one turn whose summons land as their own attributed posts,
  whose report names the posts it built on, and whose whole execution is a `runs` + `run_steps` row the
  reader can drill into. A brief cut short by the budget leaves a row naming who was never asked, or who
  answered with no report to show for it. A row belongs to one seat's thread **or** one org's channel —
  enforced by a DB check, not by convention.

### Automation
- **Routines**: five schedule labels plus `Every N hours`, wall-clock resolution through `Intl` (so a zone
  and a DST-absent hour are projected, not special-cased), a due index, `next_run_at`/`last_run_at`/
  `last_status` per row, and claim-by-predicate under a row lock so two tabs cannot start the same run.
- **Execution is real when it happens**: a run row, steps, a model call, the answer posted into the
  seat's thread. The tick runs when the workspace is read, and the UI says there is no worker rather than
  implying a daemon. "Run Now" records `WAITING_FOR_TOOL` with the reason, because that is what it is.
- **Approvals**: an agent can stop and raise an action for a human to decide; the decision is audited and
  nothing is performed either way (there is nothing to perform).
- **Events**: an append-only audit stream (workspace/agent/team/org lifecycle, runs, approvals).

### Observability
- The activity board is a printer: In flight (frames this client actually received), Needs attention (real
  pending approvals, blocked/waiting runs, due routines), Upcoming (stored `next_run_at`), Record
  (newest-first stored runs, hops, selected events, decided approvals). A section with no rows is absent.
- Every figure on screen traces to the board payload; seeded sample rows are forced grey and labelled
  "sample"; a reply's provenance prints inline under it.

### What Arova does not do (each of these is stated in-product, not hidden)
- **No real tools.** No web fetch, search, browser, shell or file access. The registry lists each with the
  reason it is off (`run_command`: "commands would run on your machine, so this stays off").
- **No connectors.** `connectTool` throws the honest sentence; `connections`/`sandboxes` tables exist and
  nothing populates them for real. No OAuth.
- **No background worker**, so nothing runs while the app is closed.
- **No persistent agent compute** and no isolated sandbox — no per-agent machine, files or environment.
- **No per-organisation memory** and no retrieval: context is the transcript inside the token budget.
- **No multimodality**: no image/audio in or out, no file upload, no image or video generation.
- **No citations**, because nothing browses — there is no source to name.
- **No channels outside the browser**: no Slack/Teams/email/voice surface, no API for third parties to
  talk to a seat, no inbound triggers.
- **No pagination or retention** on messages (the board loads every row per workspace), no export.
- **No evals, tracing, prompt versioning or A/B**; runs and steps are the only execution record.
- **No multi-user tenancy**: no members, roles, admin policy, shared billing or audit export.

### What our own stack can actually support (probed, not assumed)
Checked against the running database on 2026-10-01 so the gap ranking below is bounded by reality:
- **PostgreSQL 18.3**, driver `pg`, ORM Drizzle. Installed extensions: `plpgsql` only.
- **`vector` (pgvector) is NOT available** on this server. Anything needing embeddings must either store
  vectors elsewhere, ask the user to install the server package, or not claim semantic search.
- **`pg_trgm`, `pgcrypto`, `unaccent` are available** (installable with `CREATE EXTENSION`, no new npm
  dependency).
- **Built-in full-text search works today**: `to_tsvector('english', …)` + a GIN index needs no extension
  and no dependency. So *org memory that compounds from the channel* is buildable in this repo as-is;
  semantic/vector memory is a server-install decision that belongs to the user, not a feature to fake.
- Only two HTTP routes exist (`/api/board`, `/api/health`) and there is no upload handling anywhere, so
  "no inbound triggers, no files" is structural, not an oversight.

---

## 2. Grok (xAI) as of 2026-10-01

Status marks are the researcher's, and the **unverified** flags are kept deliberately: a claim laundered
into certainty here would mislead a build decision worse than an admitted gap.

### Models and modes
- Grok 4.6 default for consumers (GA 12 Aug 2026); Grok 4.7 GA 21 Sep 2026 — 500K context, $2/$6 per M
  tokens, with standard / "xHigh" / rapid effort tiers. grok-4.3 / 4.20 at 1M context; 4.1 Fast at 2M;
  grok-build-0.1 at 256K. Tiered-context pricing (price doubles above 200K prompt tokens).
- Modes: Auto, **Think** (extended reasoning), **DeepSearch / DeeperSearch** (agentic multi-source
  research), **Expert** ("Big Brain", internal-only). ⚠ The current grok.com picker itself was not
  confirmed from a primary source.
- **Effort tiers are a model-level product feature** — the same axis Arova models as `low/medium/high →
  output-token budget`. Ours chooses a budget; theirs chooses a reasoning depth.

### Assistant capabilities
- Live web **and X** search with real-time grounding and citations (GA). File/PDF upload and analysis
  (GA). Voice mode sub-second; voice STS 2.0 GA 18 Sep 2026, voice APIs GA 17 Apr 2026. **Imagine**
  text-to-image/video (15s clips; Image 2.0 7 Aug, Video 1.5 Jun/Jul 2026).
- Office-suite surfaces: Grok for Word/Excel/PowerPoint/Outlook (GA Jun–Jul 2026), Google Workspace
  (24 Jul 2026).
- Translation: no primary evidence found — treated as model-level only, **unverified**.

### Personalisation and memory
- **Cross-chat memory** GA on the consumer app (launched ~Apr 2025). The on/off and review controls were
  not confirmed from a primary source.
- "Memory in Grok Build" announced 16 Sep 2026; Skills GA 18 May 2026; Companions/personas are
  secondary-sourced. ⚠ **Projects, "Knowledges" and custom instructions could not be confirmed** — the
  researcher explicitly flagged this rather than assuming.

### Agents and automation — the closest overlap with Arova
- **Grok Bot** (GA-ish beta, 11 Aug 2026): always-on **cloud agents** with **peer-to-peer multi-agent
  coordination**, that sign into third-party apps **from their own VMs**, hand off work **over messaging**,
  work with X (29 Aug), and were pulled into more plans (26 Aug).
- **Automations** (GA 16 Jul 2026): one-time / daily / weekly / monthly / yearly schedules, **free on every
  tier**; **email-triggered** runs are premium-only. `/goal` announced 22 Jun 2026.
- **Grok Build** (terminal coding agent, early beta 25 May 2026): plan-then-execute with the human
  approving diffs, **parallel subagents in separate git worktrees**, loads `AGENTS.md`/hooks/MCP,
  headless `-p`, ACP; open-sourced 15 Jul; web+mobile 19 Aug; Agent Dashboard, Workflows, Plugin
  Marketplace. Grok Code Fast 1 (GA 28 Aug 2025) is the agentic-coding model. ⚠ **BugCrawl could not be
  confirmed in any primary source.**

### Collaboration and workspace
- Public conversation share links (GA).
- **Team Bots** (public beta 28 Sep 2026): team bots that **learn from team interactions**, a **shared
  workspace plus private threads**, on Teams/Enterprise, across macOS/iOS/Android/X.
- **Grok Bot for Enterprise** (GA 3 Sep 2026): admin dashboard, access/network/audit controls,
  **zero-permission default agents**, **per-run isolated sandboxes**, seat-free invitations. Business /
  Enterprise add SSO, directory sync, audit logging, RBAC, user analytics, encrypted storage, custom rate
  limits.

### Governance, limits and cost
- Tiers: Free (4.6, voice, search, Build, connectors) · SuperGrok $30 (Grok Bot, Expert, image/video,
  higher limits) · SuperGrok Plus $100 (1080p video, early access, priority routing) · Lite/Heavy listed
  with no price shown (Heavy ≈$300/mo is third-party only — **unconfirmed**) · Business/Enterprise custom.
- API returns **encrypted chain-of-thought traces by default**. Data controls (training opt-out, retention)
  were **not verified from a primary source**.

### Integrations
- **Connectors** GA 6 May 2026: SharePoint, Outlook, OneDrive, Google Workspace, Notion, GitHub, Linear —
  plus **Bring Your Own MCP**. MCP is also loaded natively by Grok Build.
- Distribution through GitHub Copilot, Amazon Bedrock, Microsoft Foundry, Databricks, Gemini Enterprise,
  Warp, OpenCode, Kilo Code. ⚠ Official Telegram/WhatsApp: only third-party bridges found — **unverified**.

### Developer surface
- **Agent Tools API** (GA 19 Nov 2025): server-side web search, real-time X search, file/document
  retrieval **with citations**, a **hosted sandbox**, from $5 per 1K calls. Chat + responses endpoints,
  vision with interleaved multi-image input, streaming, batch, tool calling, reasoning-effort controls,
  and multi-agent model variants (grok-4.20).

### What Grok has that a workbench like ours typically lacks
1. Real-time X/web grounding **with citations**.
2. Cloud-VM agents that sign into SaaS as a user, with **per-run isolated sandboxes**.
3. Built-in image/video generation and low-latency full-duplex voice.
4. **Email-triggered** automations next to time-triggered ones.
5. Office-suite-native surfaces where the work already happens.
6. A plugin marketplace + BYO-MCP on a hosted platform.
7. Frontier models with published agentic benchmarks and tiered-context pricing.

### Sources
[x.ai/news](https://x.ai/news) · [Grok Bot](https://x.ai/news/introducing-grok-bot) ·
[Grok Bot for Enterprise](https://x.ai/news/grok-bot-for-enterprise) ·
[Grok Automations](https://x.ai/news/grok-automations) · [Grok Build CLI](https://x.ai/news/grok-build-cli) ·
[Grok Connectors](https://x.ai/news/grok-connectors) · [Grok 4.7](https://x.ai/news/grok-4-7) ·
[Grok Code Fast 1](https://x.ai/news/grok-code-fast-1) · [Agent Tools API / grok-4.1-fast](https://x.ai/news/grok-4-1-fast) ·
[x.ai/grok](https://x.ai/grok) · [x.ai/pricing](https://x.ai/pricing) · [docs.x.ai models](https://docs.x.ai/developers/models) ·
[Wikipedia: Grok](https://en.wikipedia.org/wiki/Grok_(chatbot))

---

## 3. OpenAI Dots as of 2026-10-01

Dots is OpenAI's always-on agent inside ChatGPT (announced ~29 Sep 2026). **A correction to what I first
wrote down:** the "~$100/mo Pro tier" figure came from a secondary listicle; no Dots page states a price,
and secondaries disagree ($100–$500/mo). Treat Dots' pricing as **unannounced**, not as $100.
openai.com and help.openai.com refused direct fetch, so primary wording is read through a mirror of the
same URLs — second-hand text, primary document.

### What a dot is
- A **persistent named agent instance** on GPT-6 Astra (GA). **One per user at launch** — "start with
  your primary dot, give it a name"; more dots are *announced only*.
- Shared into a team space by bringing it into a channel. The org form — **specialist dots** with their
  own identity, credentials and IT-provisioned hardware — is **preview / corporate trials**, set up with
  OpenAI engineers, not self-serve.

### Persistence and memory
- Hybrid: "your dot receives memories from ChatGPT and can create its own memories" (GA). Retains context
  "for as long as you keep your dot"; turning ChatGPT memory off stops the feed.
- **Review and edit are weak**: you delete its context by deleting the dot. No per-memory editor. Deleting
  the dot removes conversations, memories and scheduled tasks together, but threads/files it produced
  survive. Context "does not retain credentials, images, or screenshots".

### Compute and environment
- **"Each dot works on its own cloud computer"** with **its own browser** (GA). The user can open it live
  and interact. Local-machine access is opt-in through the desktop app, with an explicit "Revoke access".
- Logins: "dots can use saved passwords **without exposing them to the model**" (GA).
- ⚠ Not verified: VM specs, idle/restart policy, storage quota, egress policy, whether files survive a
  restart (as opposed to a deletion).

### Autonomy and scheduling
- Always-on: keeps progressing between conversations, "works toward your goals 24/7", and **when you aren't
  working with it, it looks for ways to help** — idle proactive research (GA). Runs several projects in
  parallel.
- **A hard read-only fence on unsolicited work**: during background research it "cannot send messages,
  change app content, or control a browser or computer". (Semi-verified: wording from a secondary that
  matches the primary's "non-modifying access".)
- Routines are natural-language ("run a recurring check"); states are In progress / Scheduled / Completed.
  Delegates to Codex / ChatGPT Work tasks (GA). OpenAI's own monitoring "can pause or stop the dot's work".
- ⚠ No documented event triggers beyond app scanning.

### Channels
- GA: ChatGPT web/desktop/mobile, **Slack**, **Microsoft Teams**, voice in. Texting is "coming next"; the
  dot **cannot initiate calls** at launch; no email channel; channels must be connected from desktop.
- **No API surface at all.**

### Tools and governance
- "Connect to over 4,000 apps" through the existing ChatGPT connector ecosystem (not a new registry), with
  per-app permission review at connect and grants managed in existing app controls. MCP specifics are
  **secondary-only, low confidence**.
- **Custom Rules**: allow / require-approval / block per action, and they cannot override built-in safety
  (GA).
- **Auto-review**: a *separate reviewer agent* classifies each action at the sandbox boundary — "a reviewer
  swap, not a permission grant" — with a **circuit breaker** that interrupts the turn after 3 consecutive
  denials or 10 denials in the last 50 reviews, an `/approve` picker, and policy written as a small
  `auto_review` block. ([learn.chatgpt.com/docs/sandboxing/auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review), 1 Oct 2026)
- Audit is the Activity View. Enterprise/Edu/Healthcare: **off by default**, admin-enabled; Microsoft Agent
  365 governance "in progress" (announced-only).
- Data: excluded at launch in EEA/Switzerland/UK for Pro; 18+/age-verified; business/edu data not used for
  training by default; no training on proactive research or notes-to-self; limited human safety review
  possible. **No dots-specific spend dashboard, rate limits or residency guarantees published.**
- Conversations with a dot don't count toward ChatGPT usage limits; delegated Codex/Work tasks are metered
  normally; extended limits for the first month, then "detailed billing parameters will be distributed".

### Multi-agent — where our Feature 11 sits relative to them
- **No dot↔dot messaging today.** "Over time, we envision teams of dots working together" is stated as a
  vision. Cross-agent work happens by *delegating to Codex/ChatGPT Work*, and the only org/role concept is
  the specialist-dots preview. ⚠ A VentureBeat headline referenced a "ChatGPT Space" multi-agent model but
  the article was unreachable (429) — **do not treat as verified**.

### Hardest-to-replicate things Dots has
1. Per-agent persistent cloud VM + browser + password vault.
2. A 4,000-app connector catalogue with per-user OAuth and admin consent.
3. A dedicated frontier model behind the agent.
4. Always-on idle proactive work (needs the background worker we deliberately don't fake).
5. Slack/Teams/voice as first-party surfaces.
6. An independent auto-reviewer agent with a denial circuit breaker.
7. Managed local-device opt-in bridge.
8. Vendor-run safety monitoring that can pause an agent; federated enterprise governance.
9. Bundled-into-plan commercial metering.

### Sources
[Introducing dots](https://openai.com/index/introducing-dots/) ·
[Dots feature page](https://chatgpt.com/features/dots/) ·
[Getting started with your dot](https://help.openai.com/en/articles/20001530-getting-started-with-your-dot) ·
[Dots privacy/security/safety FAQs](https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs) ·
[ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes) ·
[Auto-review and sandboxing](https://learn.chatgpt.com/docs/sandboxing/auto-review) ·
[Vellum breakdown](https://www.vellum.ai/blog/official-openai-dots-breakdown) ·
[Flavio Copes deep dive](https://flaviocopes.com/openai-dots/) ·
[Marc Bara](https://medium.com/@marc.bara.iniesta/openai-dots-chatgpt-joins-the-always-on-agent-race-caa0b188da0f) ·
[Platformer](https://www.platformer.news/openai-dots-agents-devday-2026/) ·
[TNW](https://thenextweb.com/news/openai-dots-always-on-ai-agents-cloud-computers-devday)

---

## 4. The matrix

"Ours" cites the thing that proves it — a table, a route action, or a module. A cell that says *deliberate*
means the product refuses the feature out loud, in the UI, rather than silently failing.

| Axis | Grok | Dots | Arova | Verdict |
| --- | --- | --- | --- | --- |
| Agent entity | Many bots + Team Bots (beta) | **1 dot** per user; more announced | Many seats, unlimited, in orgs (`agents`, `teams`) | **Ours is ahead on structure** |
| Agents talking to agents | Yes — peer-to-peer coordination, messaging handoffs | **No** ("we envision teams of dots") | Yes — `consult`/`handoff` + the channel; each hop a `delegations` row | **Ours matches Grok, beats Dots** |
| Durable record of that work | Not documented | Not documented | Yes — channel posts, authored, with the report naming its sources (`messages.team_id` + check) | **Ours is the only one shown** |
| Org chart / reporting lines | No | No (specialist-dots preview only) | Yes — `manager_id` tree, lead, creator tier | **Ours, unique** |
| Who may create an agent | Admin (enterprise) | IT-provisioned | Designated creator seat founds; lead staffs its own org (`mayFoundOrg`/`mayStaffOrg`) | Ours, in-code and testable |
| Memory | Cross-chat memory GA; "memory in Build" | Account memory + dot's own notes; **delete only by deleting the dot** | **None** beyond the transcript in the token budget | **Biggest gap — §5.1** |
| Per-org memory isolation | n/a | n/a | Reach + history are hermetic; no stored knowledge | Gap, and the one the user asked for |
| Tool execution | Real: browser, X, office apps, connectors | Real: own VM, own browser, saved passwords | **None.** 12 tools listed with `whyUnavailable` each | **Deliberate; the real ceiling** |
| Sandbox isolation | Per-run sandboxes (enterprise) | Persistent per-dot cloud computer | `sandboxes` table exists; `sandboxAction` throws the reason | Deliberate |
| Connectors/OAuth | 7 named + BYO-MCP | ~4,000 apps | None; `connectTool` refuses | Deliberate; needs your credentials |
| Web grounding with citations | Yes (web + X firehose) | Via browser/connectors | No search provider; `web_search` off | Gap, external dependency |
| Scheduled work | Time + **email-triggered**; free on all tiers | NL routines; In progress/Scheduled/Completed | Time-based, timezone-correct, claim-by-predicate (`routines`, `scheduler.ts`) | Ours matches on time; no event triggers |
| Runs while app is closed | Yes (always-on) | Yes (24/7) | **No** — tick on read, and the UI says so | Deliberate (no worker) |
| Proactive/idle work | Yes | Yes, fenced read-only | No | Deliberate; needs the worker |
| Approvals for actions | Diff approval in Grok Build | Custom Rules (allow/ask/block) + reviewer agent | `approvals` rows raised by the agent, decided by the human; `plan` mode blocks writes | Ours matches the *shape*, lacks the reviewer |
| Denial circuit breaker | Not documented | **3 consecutive / 10-in-50 denials interrupts the turn** | None | **Cheap idea worth stealing — §5.3** |
| Budget/spend visibility | Plan tiers + API pricing | Not published per dot | Per provider/day calls + tokens, est-vs-reported, `DAILY_MODEL_CALLS_LIMIT` enforced at every call site | **Ours is more legible than either** |
| Audit trail | Enterprise admin/audit | Activity View | `events` append-only, printed on the board | Ours matches |
| Multimodal (image/voice/video) | All GA | Voice in; images in context | None | Gap, out of scope for a workbench |
| Channels outside the app | X, Telegram/WhatsApp (unverified), office suites | Slack, Teams, voice | Browser only | Gap |
| Multi-user tenancy | Business/Enterprise: SSO, RBAC, directory sync | Enterprise/Edu admin | Cookie demo workspace, no accounts | Gap, by design of a demo |
| Public API for your agents | Agent Tools API | **None** | None (session-cookie endpoint only) | Gap; Dots shares it |
| Model freedom | xAI only | OpenAI only | **Any OpenAI-compatible endpoint** (`PROVIDERS`) | **Ours, unique** |
| Honest about what it can't do | Not documented | Not documented | Every refusal is in-product text | **Ours, and it's the point** |

**The one-line read:** we are ahead on *structure, attribution and legibility* — orgs, reporting lines, the
durable channel, per-seat budgets, model freedom — and behind on *substrate*: memory, real tools, background
execution, and channels. Of those four, only **memory** is buildable here today with no new dependency, no
credentials and no infrastructure.

---

## 5. Ranked gaps

Ranked by value to this product × whether it can be built in this repo without a new dependency, a
credential, or infrastructure the user hasn't chosen. Not ranked by how impressive it sounds.

### 5.1 Org memory that compounds from the channel — **build now, spec'd as 12**
Both competitors treat memory as the agent's core property, and Dots' version is bad in a way we can beat:
you can only delete its memory by deleting the agent, and there is no per-note review. We already produce
the raw material — every brief, every summon, every report is an attributed row in an org-scoped channel —
and keep none of it as knowledge. This is also the one feature the user asked for by name ("each
organisation should have its own memory… should not lead to other places") and that §11 recorded as
deliberately unbuilt (11d). **Feasibility is proven, not assumed**: `to_tsvector` works on this server,
`pg_trgm` is installable, and `vector` is **not** available — so this ships as reviewable keyword memory
with no embeddings and no new npm dependency, and says so.

### 5.2 Inbound triggers (an event starts a brief)
Grok fires an automation from an email; we fire from a clock, and only when someone opens the app. A
token-scoped `POST /api/trigger/:token` that queues a brief to a lead would close most of the gap without
pretending to be a worker — the honest half of "always-on" is "anyone with this URL can brief this org".
Needs a decision on auth and on what runs before the next read.

### 5.3 A denial circuit breaker and a reviewer pass
Dots' best cheap idea: an independent pass that classifies an action at the boundary, plus a breaker that
stops the turn after repeated denials (3 in a row, or 10 of 50). We already have `plan` mode, per-target
allow-lists and an approvals table; a breaker is a pure function over the last N decisions and a reviewer
is one extra model call behind a capability grant. Small, testable, and it makes our permission story real
instead of declarative.

### 5.4 Citations for anything retrieved
Every competitor grounds with sources; we have nothing to cite because no tool fetches. This is *blocked
behind* 5.1/5.2 in value order and behind a search provider in feasibility: it needs an external key, so
it's the user's call, not a feature to stub.

### 5.5 Real tool execution in a sandbox
The honest ceiling on the whole demo. Grok and Dots both have compute per agent; we refuse to run anything,
because there is nowhere safe to run it. Building this means choosing a provider (the `sandboxProvider`
seam exists) and accepting that a self-hosted agent with a shell is a different risk class than a chat app.
Not a weekend, and not ours to decide.

### 5.6 Deliberately not chasing
Multimodal generation, voice, Slack/Teams presence, SSO/RBAC tenancy, frontier-model benchmarks. Each is a
different product; the demo's argument is legible agent work on any endpoint, not a wider feature list.

---

## 6. What this changed — and what it did not

**Built the same day (2026-10-01), all verified live:**
- **5.1 org memory** → `feature-specs/12-org-memory.md`: `memories` table with a GIN full-text index,
  `src/lib/memory.ts` (5 tests, written first), hermetic retrieval injected as a labelled record, provenance
  naming what was used, and a per-org Memory panel where every note is pinnable, editable and individually
  forgettable — the thing Dots only lets you do by deleting the whole agent.
- **5.3 denial breaker** → `feature-specs/13-boundary-and-door.md`: `denialBreaker` (3 consecutive / 10 of
  50 decided approvals) behind one `approvalReply` shared by both reply paths.
- **5.2 inbound trigger** → same spec: `POST /api/trigger` with a per-org bearer token, a 60s cooldown
  measured from the end of the work, and the ask posted in the channel authored by the trigger.
- **Two controls that lied, removed:** `maxTurns` is now the summons ceiling the server enforces, and the
  unary reply path reaches the same `approval`/`build` decisions as the streaming path.

**Still open, and not buildable here:** **5.4 citations** needs a search provider and a key — the registry
still lists `web_search`/`web_fetch` as unavailable *with the reason*, which is the correct state until one
exists. **5.5 real tool execution** needs an infrastructure choice and a different risk class; `sandboxAction`
still throws the honest sentence. Multimodality, Slack/Teams presence, SSO tenancy and a background worker are
§5.6 — different products, not gaps in this one.

**The finding worth keeping:** closing the cheap gaps exposed a bug that had been there all along. The JSON
and directive parsers read the model's raw text, and a reasoning model enumerates the shapes it is choosing
between *inside its thinking* before it decides — so `parseRouting` could read a hypothetical as the answer.
Every parse site now strips a closed reasoning block first. That is not a parity feature; it is the cost of
testing against a real frontier model instead of a fixture.

---

## 7. OpenBot (CopilotKit) as of 2026-10-01

The ask arrived as "openclaw" but the link was `github.com/CopilotKit/openbot`, and the repo resolves to
**OpenBot** — a different product from `openclaw/openclaw` (the lobster personal assistant). This section
is about the linked one. Unlike §2/§3 this is not press research: it was read out of the repository itself
(README, `docs/architecture.md`, `docs/routines.md`, `docs/coworkers.md`, `docs/automatic-learning.md`), so
the mechanisms below are documented, not inferred. ⚠ stays for the few claims the docs don't settle.

### What it is
- **MIT-licensed, self-hostable "AI coworkers" template**, alpha, 5.8k stars. Bun + Hono API + React/Vite
  app + PostgreSQL (with pgvector) + Docker Compose; one Docker image, Helm charts, a Tauri desktop shell.
- Explicitly *"a template, not a product"*: no hosted version, every workspace private, the intended use is
  to clone it and swap `examples/` for your own tenant package. CopilotKit sells setup-services alongside.
- **No model in the box**: an admin supplies the credential, encrypted at rest, never logged. On the
  model-freedom axis this puts it beside us, not beside Grok/Dots.

### The coworker model
- A coworker is any **AG-UI endpoint** (LangGraph, Mastra, CrewAI, Pydantic AI, ADK, ~15 framework
  adapters ship in-tree) plus a durable profile: name, title, **standing role** re-sent every run,
  owner, `private`/`public` visibility, soft delete with tombstones.
- A **deployment-wide provenance block** is appended to every coworker's prompt by the platform, not the
  package: say where each answer came from, mark anything answered from own knowledge, never present the
  latter as the former. It *cannot be forgotten* by the next coworker someone adds.
- **Skills are instructions, not capabilities** — verbatim our own doctrine (§1, Seats), arrived at
  independently.

### Substrate — the part we refuse to have
- **A computer per Bot**: a supervisor creates one container each with its own Chromium, browser profile
  and `/workspace` volume; `COMPUTER_RUNTIME=runsc` runs them under gVisor. Computers bind to
  `127.0.0.1` behind a per-container token; the Bots' network is segregated from PostgreSQL's because a
  Bot has a shell and a shell reaches whatever its container reaches.
- **Real tools**: browser (snapshots, screenshots, forms), file tools, **and a workspace shell** — all
  through the same gate, which can deny shells or particular commands, and the command is on the record
  either way.
- **Take the wheel**: a Bot that hits a login/2FA wall asks for help; handover is recorded as
  `computer.help_requested / control_taken / control_released`, and **Bot actions are refused — not
  queued — while a human drives**.

### The policy gateway (validates our spec-13 direction, with three ideas we didn't have)
- One gateway is the *only* path to any action: resolve target from a server-held snapshot → evaluate
  policy → **write the audit row → then act** (a second row if a forwarded action fails). There is no
  path that acts without the record existing first.
- **CEL expressions, fail closed**: deny evaluated before allow; a missing policy permits nothing; a
  broken deny rule denies and a broken allow rule does not permit; a malformed configured policy stops
  server startup.
- **Initiator-aware rules**: policy inspects `initiator.kind` (`person | deployment | routine | handoff`)
  separately from `actor.id`, so a rule can refuse a *scheduled* run what it would allow the same person
  typing. Our routines run as the lead with no way to express "unattended may not do X".
- Secrets: the audit trail records that a secret was requested and its length, never the value;
  credentials are write-only through `/admin/credentials` and redacted from events.

### Governance and tenancy (where Dots is a product, this is a checkable list)
- Real multi-user: Google/Microsoft/Okta from env, **tenant-owned SAML/OIDC registered at runtime and
  routed by email domain**; `/admin/people` promotes/demotes/removes, removal ends the live session;
  every change audited. Single-user demo mode exists via `OPENBOT_SINGLE_USER=true` — the same honesty
  shape as our cookie, but labelled as the exception.
- **Governed MCP**: catalogue ships Drive/Notion + Composio's few-hundred behind one account, reached as
  the *asking person*. Unknown tools and custom-server tools are **treated as writes by default**; a
  Bot is told which connectors exist and which it holds, so it says "not granted" rather than browsing
  to the vendor.
- Routines-as-tools: `create/update/delete_routine` are a plugin entry granted **per Bot** — an admin
  decides which Bots may schedule future work before anyone decides what that work is.

### Routines — the most transferable block in the whole repo
- Created only by asking in chat (sentence → cron), runs as the asker, replies land in the channel.
- **A 15-minute floor and a 20-enabled cap** because "a model can be talked into anything a sentence can
  describe"; `MINIMUM_INTERVAL_MS` is the same constant as the sweep window.
- **A fatigue rule, explicitly *not* a retry policy**: first failure posts one message; ten consecutive
  failures switch the routine off and say so — the expired-since-March Notion token question, not the
  hiccuped-queue question.
- **Missed windows are skipped, not replayed**: the next run is a stamp, not a queue; a restarted worker
  drains backlog by advancing silently, never by firing thirty stale summaries.
- **The worker proves it sweeps**: every sweep writes to `routine_sweeps`; the Routines page reads it and
  tells you if no worker ever checked in or when the last one did — because a no-worker deployment
  *used to look identical* to a healthy one. Their old failure mode is exactly our §1 "the UI says there
  is no worker" stance, upgraded with a heartbeat.

### Memory and learning
- Threads and memory are durable through **CopilotKit Intelligence** (external managed or self-hosted
  service) — not in the repo's own Postgres. ⚠ The memory's review/edit UX is not documented here; we
  know it stores and delivers, not what a user can do with an individual memory.
- **Automatic Learning**: opted-in Bots contribute completed conversations to a Learning container;
  Intelligence analyses the evidence and **proposes skills**; a human reviews the source evidence and
  publishes revisions; delivery is per-Bot with optional revision pinning. Neither a scheduled analysis
  nor enabling Learning auto-approves anything. This is the shape our §5.1 memory can grow toward —
  experience distilled into reviewable, human-approved capability text.
- Live voice calls exist and route substantive answers through the same governed `ask_agent` run. ⚠
  Depth of the voice surface unverified beyond the learning doc.

### Components instead of prose
- Answers can be **React components**: compiled ones in-tree, sandboxed ones authored in a browser
  playground and published with no deployment. Every render asks the server whether the component exists,
  is published, and is not withheld from that Bot; data functions are granted per component. Arova is
  text + structured posts only; this is a genuinely different axis. ⚠ How much authors rely on it in a
  real tenant is unknowable from a template repo.

### What this changes for us
**Corroborates, hard:** spec 12 (memory → reviewed knowledge, now with a learning loop to aim at),
spec 13 (decide-then-record gateway — they built exactly the shape we spec'd, plus fail-closed CEL),
and §5.5 (a self-hosted per-Bot computer is buildable by a small team under MIT; "not ours to decide"
stands, "impossible here" would not have).
**Still only ours:** orgs with reporting lines, `consult`/`handoff` delegation with per-hop records, the
durable channel, per-seat token budgets. OpenBot has no agent-talking-to-agents structure at all —
`initiator.kind: handoff` implies human-directed passing of work, ⚠ and no coworker↔coworker protocol
was found in the docs. On *structure* our §4 read survives the third reference.
**New, cheap and worth stealing — all three built the same day as Feature 14 (`feature-specs/14-openbot-steals.md`),
tests written first, 144/144 green:**
1. **Initiator on every decision** — tag approvals/brief steps with what started the run so `plan`
   policy can be stricter for routines than for typers. A field and a predicate.
2. **The fatigue rule** (fail-once-quietly, ten-and-off, one message each way) on top of our
   `routines.last_status` — smaller than it sounds, and it is the answer our "no worker" honesty pairs
   with if 5.2 ever grows one.
3. **The standing provenance sentence** appended platform-wide, un-forgettable by any seat — a prompt
   line today, before any citation feature exists.

### Sources
[CopilotKit/OpenBot](https://github.com/CopilotKit/OpenBot) (README, 2026-10-01) ·
[docs/architecture.md](https://github.com/CopilotKit/OpenBot/blob/main/docs/architecture.md) ·
[docs/routines.md](https://github.com/CopilotKit/OpenBot/blob/main/docs/routines.md) ·
[docs/coworkers.md](https://github.com/CopilotKit/OpenBot/blob/main/docs/coworkers.md) ·
[docs/automatic-learning.md](https://github.com/CopilotKit/OpenBot/blob/main/docs/automatic-learning.md) ·
[copilotkit.ai/openbot](https://www.copilotkit.ai/openbot) · [AG-UI protocol](https://github.com/ag-ui-protocol/ag-ui)
