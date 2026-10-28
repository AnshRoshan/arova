# Market brief — rev 2 (2026-10-28)

**Scope.** The always-on agent / agent-workspace market, and Arova's position in it. Arova's own state
is read from the code on this tree, not from a spec. The root OpenDots `ARCHITECTURE.md` §19 is
architecture evidence about open-source internals; it is not this document and is not duplicated here.

**Status.** Research record, not a build spec. Rev 1 (2026-10-01) is in git history under this
filename's previous content. This revision widens the field from three products to thirteen, adds
pricing, reliability, demand and substitute evidence, and records the three product slices built from
the ranking (§8).

**Method and source tiers.** A = vendor/provider primary page (or the repository itself). B = a
maintainer document or a published benchmark/paper. C = press, guide or secondary summary. A claim
whose source could not be reached is labelled **unverified**. Prices are list prices in USD as
published on the date checked; they are not invoiced costs, and they change.

**Refresh.** Quarterly, or sooner if a tracked vendor ships a material change. The change log is at the
end. A dated row is allowed to age; an undated row is not.

---

## 0. The one-page read

1. **The category has a price and a shape.** Hosted always-on agents sit at roughly **$15–200 per
   user per month** (Agent 365 $15; Duet/Muse/Spark entry tiers $20; Dots $100+; Grok $30–200; Manus
   $20–200). Self-hosted agents are **free software plus server and model cost**. Arova is in the
   second group and has no hosted price.
2. **Substrate is table stakes, not the differentiator.** A cloud computer, a browser, a connector
   catalogue and a scheduler are now present in every hosted product and in several open-source ones.
   Building a computer is still hard, but it no longer makes a product distinct.
3. **The unserved position is governed, attributable multi-agent work for a small team that owns the
   stack.** Dots has no dot-to-dot messaging; Grok has peer coordination but no durable per-hop
   record; OpenBot has no agent-to-agent structure; OpenClaw and Hermes are single-agent personal
   assistants. Arova's orgs, reporting lines, channel, per-hop `delegations`, reviewable memory and
   per-seat budgets are the only combination in this sample.
4. **Reliability is the market's open wound.** OSWorld 1.0's best agent is **63.5%** against a
   **72.36%** human baseline; OSWorld 2.0's best agents are around **44%** on 108 long-horizon
   workflows where humans take over an hour; WebVoyager leaders self-report **~89%**. The honest
   product response is review-first, bounded and auditable — which is what Arova already refuses to
   fake — but we do not yet have our own measured pass rate.
5. **What we lack, in market order:** channels beyond a generic webhook (Slack/Teams/Telegram/email
   adapters), real tools and a computer, search with citations, packaging, enterprise governance,
   and a public reliability record. The first, third and sixth are partly closed in this pass (§8).
6. **The name is not safe yet.** "Arova" is already used by Arova Nexus (AI enterprise IT operations),
   Arova Technologies (AI automation) and an AROVA DeFi agent. This is a search/category collision,
   not a proven trademark conflict; check before a public launch.

---

## 1. Market map

### 1.1 Hosted always-on agents

| Product | Price (checked 2026-10-28) | Substrate | Channels | Memory | Distinctive claim | Tier / date |
|---|---|---|---|---|---|---|
| **OpenAI Dots** | First dot included on Pro ($100+) and Business Premium; higher Pro tiers vary; extra dots not published | Cloud computer + browser on GPT-6 Astra | ChatGPT, Slack, Teams | Account memory + dot notes; delete only with the dot | 4k+ apps, auto-review, read-only proactive work | A 2026-09-29; C for higher tiers |
| **Claude Duet** | Pro $20 / Max $100+; research preview | Anthropic cloud VM | Claude app, web, iOS, Android | Claude account memory, editable in settings | 6,000+ tools; classifier-based auto-approval; no direct password access; US waitlist | A 2026-10-21; C for pricing guide |
| **Gemini Spark** | AI Pro $19.99 / Ultra $99.99–199.99 | Google Cloud VM | Gemini, Gmail/Docs/Drive/Calendar, third-party apps; US Chrome control | Not published as a per-item editor | 15 parallel jobs; scheduled automation; excluded from EEA/UK/CH | A product page; C guide 2026-10-13 |
| **Meta Muse** | Free / $20 / $100 | Own cloud VM | Muse app, web, WhatsApp | Editable text files | Purchase approval; Stripe Link | A 2026-09-08; C pricing 2026-09-08 |
| **Grok Bot** | X Premium $30–$200 | Cloud agents, own VMs | Grok, Slack, Teams, messaging | Shared across bots; not user-editable | Peer-to-peer multi-agent coordination; email triggers | C 2026-10-01 (rev 1) |
| **Microsoft Agent 365** | $15 per user per month; part of M365 E7 | **Control plane, not an agent** | M365 admin, Entra, Purview, Defender | n/a | Observe / govern / secure a registry of agents | A 2026-05-01 |
| **Manus** | Free / $20 / $40 / $200; Team $20/seat | Hosted | Web | Not documented as per-note | Credits; research, coding, data workflows | C 2026-10-25 |

### 1.2 Self-hosted / open-source

| Product | Price | Model | What it proves | Tier / date |
|---|---|---|---|---|
| **OpenClaw** | Free software; server + model cost | MIT; local/self-host; 20+ channels (Discord, Slack, WhatsApp, …) | State and memory stay on the operator's hardware; setup is the tax | A repo; C setup guide |
| **Hermes Agent** | Free software; server + model cost | MIT; 257k+ stars; CLI, Telegram, Discord; persistent memory; self-created skills | Personal-agent demand is large; memory and channels are the entry price | A repo; C reviews |
| **CopilotKit OpenDots** | Free | MIT; alpha Sep 2026; persistent agents each with an isolated computer + Slack | The exact category is already open-source; the name is occupied | A repo |
| **OpenBot** | Free | MIT; per-Bot gVisor container, browser, shell, CEL policy gateway, real SSO, worker | Substrate is buildable by a small team; no agent-to-agent structure | A repo (rev 1 §7) |
| **OpenMausBot** | Free | Apache-2; per-bot `trycua/xfce-cua` container, BYO VPS, boat.dev archive/resume | Hybrid self-host is a real topology; SQLite + one OS user per tenant is enough at small scale | A repo (root §19) |
| **Rakazo** | Free | Apache-2; 7 sandbox providers, 55 Prisma models, pgvector, graphile-worker | The provider slot is real; approval and idempotency must live where the DB transaction is | A repo (root §19) |

### 1.3 Infrastructure (what a computer or browser costs)

| Provider | Entry rate | What it is | Tier / date |
|---|---|---|---|
| E2B | ~$0.05/hr; 2 vCPU + 2 GB desktop ≈ $0.12/hr | Firecracker microVM, pause/resume | C 2026-09; A rate card |
| Box | ~$0.10/vCPU-hr | Container, ~0.4 s resume, filesystem persistence | C 2026-09 |
| Modal | ~$0.14/hr | gVisor, sub-second start, snapshots | C 2026-09 |
| Browserbase | ~$20/mo entry | Hosted browser sessions | C (rev 1) |
| Steel / Kernel / Anchor / Browser Use | Varies; see vendor pages | Browser infrastructure | C 2026-09 |

**Read:** a desktop is cheap per hour and expensive per always-on tenant. The old root calculation
stands: the control plane is not the cost; the per-tenant always-on machine is. That is why
scale-to-zero and pause/resume are architectural, not billing details.

---

## 2. Pricing and what it means

**Hosted price band.** $15/user/mo (Agent 365, governance layer) → $20–30/mo (Duet, Muse, Spark,
Manus entry, Grok entry) → $100/mo (Dots Pro, Duet Max, Muse Maximum, Spark Ultra entry) → $200/mo
(Grok top consumer tier, Manus top). The first agent is usually bundled into a plan that already
exists; the marginal price of the *first* agent is therefore often zero to the buyer.

**What is not published.** Extra Dots, real per-plan limits, overage rules, per-run cost, and the
price of a second agent. Do not quote a per-run figure for a competitor as fact.

**Self-host price.** Free software plus a server (the comparison guides put a small VPS at ~$6/mo)
plus model usage. The operator pays the model vendor directly. This is the honest alternative to a
subscription, and it is the one Arova can offer today without building billing.

**Arova today.** No price and no billing. That is a positioning choice, recorded as D-19: self-host
first; do not invent a hosted price before there is a hosted product.

---

## 3. Reliability: the number that decides the product

| Benchmark | What it measures | Result | Tier / date |
|---|---|---|---|
| OSWorld 1.0 | 369 real computer tasks | Best agent 63.5% (Agent S3 w/ bBoN); second 62.3% (GLM-5V-Turbo); human 72.36% | C leaderboard 2026; A paper |
| OSWorld 2.0 | 108 long-horizon workflows; humans take >1 hour | Best agents ~44% | B 2026-06-26 |
| WebVoyager | Real websites | Fara1.5-27B 89.3%, Fara1.5-4B 80.8% — provider self-reports | C 2026-10 |
| GAIA | General assistant tasks with verifiable answers | Public leaderboard and reliability dashboard; do not cherry-pick a single row | B/C |

**Interpretation.** Long-horizon computer work fails more often than it succeeds at the frontier. A
product that presents an unverified success as a result is not optimistic; it is unsafe. The market
already sells review layers (Dots auto-review, Duet classifiers, Agent 365 governance) because the
underlying agent cannot be trusted alone.

**Arova's response, and its gap.** Arova has approvals, a denial breaker, an append-only event
stream, per-seat budgets and a provenance sentence. It now also has an eval harness that records a
pass/fail against an expected fragment, and a skipped run when no model is configured. What it does
not have is a golden-task suite with cost and step metrics, or a published pass rate. Until it does,
"honest" is a design claim, not a measured one.

---

## 4. Demand and security

- **Demand is real and uneven.** McKinsey's 2026 survey reports **40% of large organizations are
  scaling AI agents**, up from 27% a year earlier (A, 2026-08). LangChain's State of Agent Engineering
  reports **57% of respondents have agents in production**, and names **quality** as the production
  killer (B). The buyer is not asking "can it act?"; they are asking "can I trust what it did?"
- **Governance is a budget line.** Microsoft sells Agent 365 at $15/user/mo as an observe/govern/secure
  layer over agents it did not build (A). That is evidence that agent inventory, identity, policy and
  audit are purchased separately from the agent itself.
- **Security is the adoption tax.** Prompt injection, memory poisoning and tool-supply-chain risk are
  now standard enterprise-agent concerns (C, multiple 2026 guides). Arova's current answer is real but
  partial: approvals, a denial breaker, metadata-only desktop audit (planned with the desktop),
  same-origin writes and a per-workspace write bucket. It has no effect ledger for external actions
  and no sandbox, so it cannot yet claim a full action boundary.
- **Implication.** A self-host product that gives a small team an agent registry, an attributable
  record and reviewable memory is selling the thing the market is already paying a governance layer
  for. That is a stronger position than "another agent with a computer".

---

## 5. Substitutes

The buyer does not only compare Arova to Dots. They compare it to:

| Substitute | Better at | Where Arova differs |
|---|---|---|
| RPA (UiPath) | Deterministic, audited, existing enterprise connectors | Arova is language-first and model-neutral; RPA is brittle for judgment work |
| Workflow automation (Zapier, Make, n8n) | Cheap triggers, huge connector catalogue, no model required | Arova adds a named team, reviewable memory and a reasoning record |
| Coding agents (Claude Code, Cursor, Devin) | Code changes with diffs and tests | Arova is for non-code recurring work; it can delegate to a coding tool later |
| Microsoft 365 Copilot / Agent 365 | Distribution, identity, compliance, existing data | Arova is model-free and self-hosted; it does not require the Microsoft estate |
| A human virtual assistant | Judgment, accountability, relationships | Arova is cheaper per routine and auditable; it is not a replacement for judgment |
| OpenClaw / Hermes + cron | Free, local, many channels | Arova adds org structure, per-hop attribution, reviewable memory and a governance view |

**Read:** the product is not competing on access. It is competing on **structure and evidence**.

---

## 6. Positioning, segment and kill criteria

### 6.1 Segment (working decision D-19)

**Self-host-first, owner-operated workspace for a small team (1–10 seats) that wants to own the stack
and the model choice.** The buyer is technical enough to run a Postgres and a Next.js app, or has
someone who is. They already pay for a model endpoint, or want to use one the hosted products do not
offer. They value auditability over a polished consumer surface.

This is a recommendation, not a proven demand curve. The root `OpenDots` decision D-30 (self-host
tool vs hosted service) remains the owner's call; D-19 is the reversible working answer that lets the
product move without inventing billing or multi-tenant SaaS.

### 6.2 The job

"Turn the repetitive part of my week into a named team that runs on a schedule, leaves an attributable
record, and can be reviewed when it goes wrong." The primary surface is a thread; the secondary
surfaces are the org chart, the channel, the routine schedule and the registry. The desktop is a later
capability, not the identity of the product.

### 6.3 Why us

- **Model freedom**: any OpenAI-compatible endpoint is configuration, not code.
- **Structure**: orgs, reporting lines, `consult`/`handoff`, per-hop `delegations`.
- **Attribution**: channel posts, run steps, initiators and provenance are rows, not prose.
- **Reviewable memory**: org-scoped, source-linked, individually forgettable, keyword-based and
  honest about it.
- **Self-host**: the operator owns the database, the keys and the record.
- **Honest UX**: unconfigured, partial, skipped and failed are states, not hidden.

### 6.4 Why now

Hosted agents have proved the category and normalized the price. Open-source agents have proved
self-host demand. Neither has made the **structure layer** legible: a small team can see who its
agents are, who asked whom, what was recorded, what is waiting on a human, and what it cost. That is
the opening.

### 6.5 Kill criteria — what would make us lose

1. **The first agent is free inside a plan the buyer already has.** Dots, Duet, Spark and Muse all
   bundle an agent into a subscription. A paid hosted Arova has no room; staying free/self-host is the
   only defensible version.
2. **Long-horizon reliability stays below ~50%.** Broad autonomy is not sellable. The product must
   stay review-first and narrow, and the eval suite must show where it is reliable.
3. **Self-host agents add org structure and attribution.** OpenBot or OpenClaw could absorb the
   differentiator. Our advantage is a design choice, not a moat; it must keep shipping.
4. **Model freedom becomes universal.** If every agent platform accepts any endpoint, provider
   neutrality stops differentiating. The remaining edge is structure and record.
5. **We never measure our own pass rate.** Without a golden-task suite, the honesty claim is a
   stylistic preference. This is the cheapest criterion to fix and the most damaging to ignore.

### 6.6 The name

"Arova" is in use by Arova Nexus (arova-ai.com, AI-driven enterprise IT operations), Arova Technologies
(AI automation) and an AROVA DeFi agent. This is a search/category collision, not a legal conclusion.
A trademark search and a distinct product name are prudent before a public launch. The CopilotKit/
OpenDots collision that blocked the root project is not the only naming risk.

---

## 7. Competitive matrix

**Ours** cites what proves it on this tree: a table, a route action, a module or a feature spec. A
cell that says **deliberate** means the product refuses the feature in the interface rather than
pretending.

| Axis | Dots | Duet | Spark | Muse | Grok Bot | Agent 365 | Manus | OpenClaw | Hermes | OpenBot | Arova |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Agent entity | 1 dot | Claude agent | Gemini agent | Muse | Many bots | Registry of agents | Hosted tasks | Personal assistant | Personal assistant | Many coworkers | Many seats in orgs |
| Agent↔agent | No | Not documented | Not documented | Not documented | Peer coordination | n/a | No | No | No | No structure | `consult`/`handoff`, per-hop rows |
| Durable record | Activity | Not documented | Not documented | Not documented | Not documented | Audit/registry | Task history | Chat | Chat | Channel | Channel + runs + delegations + events |
| Org chart | No | No | No | No | No | Registry, not chart | No | No | No | No | `manager_id` tree |
| Memory | Account + dot | Account, editable | Not per-note | Editable files | Shared, not editable | n/a | Not documented | Local files | Persistent, self-created skills | Managed Intelligence | Org-scoped keyword, reviewable |
| Tools/computer | Cloud computer | Cloud VM | Cloud VM | Cloud VM | Own VMs | n/a | Hosted | Local | Local | gVisor + shell | **None** (honest refusal) |
| Connectors | 4k apps | 6,000 tools | Workspace apps | Apps/WhatsApp | 7 + MCP | n/a | Some | 20+ channels | 28 adapters | MCP catalogue | **None** |
| Grounding/citations | Browser | Tools | Google | Apps | Web/X | n/a | Research | Web | Web | Tools | `web_fetch` only; no citations |
| Scheduling | Routines | Checks | Scheduled | Recurring | Automations | n/a | Tasks | Heartbeat | Events | Routines | Time routines + worker/trigger |
| Approvals | Auto-review + rules | Classifiers | Not documented | Purchase approval | Review model | Policy layer | Not documented | Not documented | Not documented | CEL gateway | Approvals + denial breaker |
| Budget visibility | Not per dot | Plan quota | Plan quota | Plan quota | Plan quota | n/a | Credits | Model bill | Model bill | Not documented | Per-provider/day calls, estimated vs reported |
| Audit | Activity | Not documented | Not documented | Not documented | Not documented | Yes | Not documented | Local | Local | Yes | Append-only events |
| External channels | Slack/Teams | App/mobile | Gemini apps | WhatsApp | Slack/Teams/messaging | n/a | Web | 20+ | 28 | Slack | Generic webhook + inbound; **new** |
| Self-host | No | No | No | No | No | No | No | Yes | Yes | Yes | **Yes** |
| Model freedom | OpenAI only | Anthropic only | Google only | Meta only | xAI only | n/a | Vendor | Any configured | Local/any | ~15 frameworks | **Any OpenAI-compatible** |
| Price | $100+ | $20+ | $20+ | Free/$20 | $30+ | $15/user | $20+ | Free + server | Free + server | Free | **Free software** |

**The one-line read:** Arova is behind on substrate (tools, computer, connectors, grounding,
multimodal) and ahead on structure, attribution, reviewable memory, model freedom and self-hosting.
The strategy is to stop treating the first list as the scoreboard and make the second list provable.

---

## 8. Gap ranking and what shipped

Ranked by **market value × whether it can be built here without a credential, a new dependency, or an
infrastructure decision the owner has not made.** This is not a wish list.

### 8.1 Shipped in this pass (2026-10-28)

| Gap | What shipped | Proof |
|---|---|---|
| **External channels** (#1 distribution gap) | A channel contract with a generic HTTPS webhook (Slack incoming-webhook compatible), per-channel inbound token for org channels, SSRF policy, 60 s inbound cooldown, delivery ledger, UI with test/disable/delete | `src/lib/channels.ts` + 9 tests; live `DELIVERED` to httpbin.org, live `FAILED` to example.com recorded, inbound run + 429 cooldown |
| **Reliability evidence** (#2 market wound) | Eval tasks (agent + prompt + expected fragment), substring scorer, skipped/error states, audit run per attempt, pass-rate/median UI | `src/lib/evals.ts` + 4 tests; live `SKIPPED` with no model key; run row and result stored |
| **Agent governance** (#3 trust gap) | Agent registry with team/manager, status, provider, tool count, permission mode, exact run/pending/routine counts, filter | `src/lib/registry.ts` + 4 tests; live registry showed exact counts and last-run status |

### 8.2 Next, in order

1. **Native channel adapters**: Slack Events API / Teams / Telegram / email, with per-adapter
   verification and a delivery retry policy. The generic webhook is the contract; adapters are
   formatting and auth.
2. **A real computer**: E2B (or the provider chosen by the root Phase 1 measurements). **Do not
   implement before Phase 1**: the root project's own backlogs says the resume/login measurements
   decide the design. The cost is ~$0.05–0.12/hr; the risk class is the blocker.
3. **Search with citations**: needs a tool-calling loop, not just a search key. The current model has
   no autonomous tools; adding a search console without the loop would be cosmetic. Spec it first.
4. **Golden-task suite**: 10–20 tasks per archetype, cost/steps per task, a trend view. The current
   harness measures one prompt at a time; the market claim needs a suite.
5. **Packaging**: a self-host support model, an install path, and a clear statement that there is no
   hosted price. Do not invent a subscription.
6. **Enterprise governance**: RBAC/admin, retention/export, agent identity, and (if hosted) SSO.
   Agent 365 proves this is a paid layer.
7. **Memory depth**: semantic memory only if the Postgres has pgvector; otherwise deepen the
   reviewable keyword memory. Never imply recall the server cannot perform.
8. **Defer**: multimodal/voice, 4k connectors, a frontier model, 24/7 consumer proactivity, a general
   VM manager, a workflow canvas.

---

## 9. What changed since rev 1 (2026-10-01)

- **New products.** OpenAI Dots (GA 29 Sep 2026), Anthropic Claude Duet (preview 21 Oct 2026),
  Google Gemini Spark (I/O 2026; Gemini agent at Work 8 Oct 2026), Meta Muse (8 Sep 2026), Microsoft
  Agent 365 (GA 1 May 2026), Manus (already live).
- **A product left.** Google shut down Project Mariner; browser control moved into Gemini. A tracked
  product can disappear, which is why the brief is dated and refreshed.
- **Pricing moved from "unannounced" to a band.** Rev 1 correctly refused the listicle's "~$100/mo"
  for Dots. The current primary page says the first dot is included on Pro/Business Premium; Pro is
  $100+. Higher tiers and extra dots remain unpublished.
- **Reliability evidence became available.** OSWorld 2.0 and the 2026 OSWorld leaderboard turn "agents
  fail" from an intuition into a number.
- **Arova built three slices** from the ranking: channels, eval harness, registry (§8.1). It also
  fixed the docs' stale "no worker" claim in this pass.

---

## 10. Sources

**Tier A — vendor/provider primary**
- [OpenAI — Introducing dots](https://openai.com/index/introducing-dots/) (2026-09-29)
- [Anthropic — Introducing Claude Duet](https://claude.com/resources/articles/claude-duet) (2026-10-21)
- [Google — Gemini at Work 2026](https://cloud.google.com/blog/products/ai-machine-learning/welcome-to-gemini-at-work-2026) (2026-10-08)
- [Meta — Introducing Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) (2026-09-08)
- [Microsoft Learn — Agent 365 overview](https://learn.microsoft.com/en-us/microsoft-agent-365/overview) (2026-08-19; GA 2026-05-01)
- [Microsoft Security — Agent 365 GA](https://www.microsoft.com/en-us/security/blog/2026/05/01/microsoft-agent-365-now-generally-available-expands-capabilities-and-integrations/) (2026-05-01)
- [OpenClaw repository](https://github.com/openclaw/openclaw)
- [Hermes Agent repository](https://github.com/nousresearch/hermes-agent)
- [CopilotKit OpenDots repository](https://github.com/CopilotKit/OpenDots)
- [E2B pricing](https://e2b.dev/pricing)

**Tier B — maintainer docs, benchmarks, papers**
- [OSWorld 2.0 paper](https://arxiv.org/abs/2606.29537) (2026-06-26)
- [OSWorld 2.0 leaderboard](https://snorkel.ai/leaderboard/os-world-2-0/)
- [OSWorld leaderboard](https://www.codesota.com/benchmark/osworld) (2026 snapshot)
- [GAIA leaderboard](https://huggingface.co/spaces/gaia-benchmark/leaderboard)
- [McKinsey — The State of AI: Global Survey 2026](https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai) (2026-08-25)
- [LangChain — State of Agent Engineering](https://www.langchain.com/state-of-agent-engineering)

**Tier C — press, guides, secondary comparisons**
- [Wired — OpenAI's Dots](https://www.wired.com/story/openai-dots-always-on-ai-agents-that-proactively-help/) (2026-09-29)
- [eesel — OpenAI Dots pricing and limits](https://www.eesel.ai/blog/openai-dots) (2026-09-30)
- [The Agent Report — Claude Duet usage economics](https://the-agent-report.com/2026/10/claude-duet-proactive-agent-usage-economics/) (2026-10)
- [Layer3Labs — Gemini Spark explained](https://www.layer3labs.io/guides/gemini-spark-explained) (2026-10-13)
- [Layer3Labs — Manus pricing](https://www.layer3labs.io/guides/manus-ai-pricing) (2026-10-25)
- [CNBC — Meta Muse pricing](https://www.cnbc.com/2026/09/08/meta-personal-ai-agents-public-reckoning-privacy-safety.html) (2026-09-08)
- [WebVoyager leaderboard](https://benchlm.ai/benchmarks/webvoyager) (2026-10)
- [Upstash — 15 agent sandbox providers compared](https://upstash.com/blog/ai-agent-sandbox-providers-compared-2026) (2026-09-17)
- [Aimultiple — always-on agents compared](https://aimultiple.com/always-on-agents) (2026-09-30)
- [Arova Nexus](https://arova-ai.com/en/platform/) (name collision)
- [Tracxn — Arova](https://tracxn.com/d/companies/arova/__-SKsb6iUkNVWMP4-wFA9TP0Ko_W5S0xLZdsFP_Ibzw0) (2026-08-29)

**Dated revision note.** Rev 1's Grok/Dots/OpenBot inventories remain in git history. Their ⚠ flags
were correct to keep: a secondary claim that cannot be checked is not a fact, and a product page that
will not load is not evidence.

---

## Appendix A — Arova today (code-verified 2026-10-28)

- **Identity**: cookie workspace for the demo; OIDC sign-in foundation (`users`, `memberships`,
  `sessions`, hashed session token) with owner/member roles; no production auth claim.
- **Agents**: CRUD, pause/resume, per-seat instructions, provider choice, three-tint identity,
  capability registry that can only narrow what genuinely runs.
- **Structure**: teams, `manager_id` reporting lines, reviewed org templates, creator/lead staffing
  tiers, hermetic reach, channel posts, `consult`/`handoff` with per-hop `delegations`.
- **Memory**: org-scoped `to_tsvector` keyword memory, source ids, supersession, pinning, per-note
  review and forget; no embeddings (pgvector unavailable on this server).
- **Automation**: wall-clock routines with timezone/DST projection, claim-by-predicate, in-process
  worker plus `/api/cron`, fatigue off after 10 consecutive failures, inbound trigger with atomic
  cooldown.
- **Tools**: calc, world clock, JSON transform, checksum, `web_fetch` behind an SSRF policy; browser,
  shell, files, connectors and MCP transport remain refused with their reasons.
- **New this pass**: generic webhook channels with inbound org tokens and a delivery ledger; eval
  tasks with a substring scorer and honest skipped/error states; exact agent registry.
- **Gates**: `npm test` **208/208**, `next typegen`, `tsc --noEmit`, `npm run build` all green on this
  tree; live API checks covered a delivered webhook, a failed webhook, inbound run + 429 cooldown, a
  skipped eval and the registry.
- **Not present, and never to be inferred**: a sandbox, a real computer, autonomous model tool calls,
  citations from the web, a production hosted service, billing, or a measured pass rate.

## Appendix B — detailed product notes

**OpenAI Dots.** Persistent named agent on GPT-6 Astra; one per user at launch; own cloud computer
and browser; 4k+ apps through the ChatGPT connector estate; Slack/Teams; auto-review with a 3-in-a-row
/ 10-of-50 denial circuit breaker; background work fenced read-only; no dot-to-dot API. Memory is
account plus dot notes; deletion is the only per-item control. (Tier A, 2026-09-29.)

**Claude Duet.** Proactive agent app on Opus 5.5; US Pro/Max waitlist; 6,000+ tools; iOS/Android/web;
no direct password access; safety classifiers. (Tier A, 2026-10-21.)

**Gemini Spark.** Google Cloud VM; scheduled automation across Google and third-party apps; US Chrome
control; 15 parallel jobs. (Tier A/C, 2026-10-13.)

**Meta Muse.** Own cloud VM; WhatsApp/web; editable memory files; purchase approval; free/$20/$100.
(Tier A/C, 2026-09-08.)

**Grok Bot.** Cloud agents with peer-to-peer coordination, own VMs, Slack/Teams/messaging, email
triggers; X Premium $30–$200. (Tier C, rev 1 2026-10-01.)

**Microsoft Agent 365.** Not an agent: an observe/govern/secure control plane over a registry of
agents, $15/user/mo, GA 2026-05-01. The existence of this layer is the demand signal for Arova's
registry. (Tier A.)

**Manus.** Hosted task agent; credits; free/$20/$40/$200. (Tier C, 2026-10-25.)

**OpenClaw.** MIT, local/self-host, 20+ channels; memory and state on the operator's hardware; free
software. Setup complexity is the tax. (Tier A repo, C guide.)

**Hermes Agent.** MIT, Nous Research, 257k+ stars; persistent memory; self-created skills; CLI and
messaging adapters. (Tier A repo, C reviews.)

**OpenBot.** MIT; per-Bot gVisor container, browser, shell, CEL policy gateway, real SSO, worker;
no agent-to-agent structure. (Tier A repo, rev 1 §7.)

**CopilotKit OpenDots.** MIT alpha; persistent agents each with an isolated computer and Slack; the
category is already open-source under this name. (Tier A repo, 2026-09.)

**OpenMausBot / Rakazo.** Hybrid self-host topologies; provider slots; SQLite at small scale; 7
sandbox providers. (Tier A repos, root §19.)

## Appendix C — refresh checklist

1. Re-check the price and eligibility of every hosted product; mark the date.
2. Re-read the OSWorld 1.0/2.0 and WebVoyager leaders; do not compare self-reports to verified runs.
3. Check whether any tracked product shipped agent-to-agent structure, a reviewable memory editor, or
   a self-host option. Those are the four claims Arova's position depends on.
4. Re-run the Arova code inventory (Appendix A) from the tree, not from this document.
5. Update the three kill criteria that can flip: free bundled agent, reliability, self-host structure.
6. Append a change-log line; do not silently rewrite a dated row.
