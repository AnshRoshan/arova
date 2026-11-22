# Market gap audit and the next spec list — 2026-11-23

Author: full-repo audit + fresh market research, performed 2026-11-23 (no cached claims; every
"Arova lacks X" line below was verified against the tree the same day). This document supersedes
§8.2 of `feature-parity.md` (2026-10-28) as the working backlog: several of its items shipped
since (native Slack adapter, eval suites, the queue), and the market moved again in November.

---

## 1. What changed in the market since the last brief (2026-10-28 → 2026-11-23)

| Signal | Evidence |
|---|---|
| **The big four are now one comparison set.** Dots, Muse, Duet, Gemini Spark — joined by Grok Bot, Manus (Cue), Instinct and OpenClaw — are reviewed side by side; Apple (Siri) is now named in the same comparisons (2026-11-10 piece). | Nov-2026 comparison coverage |
| **Always-on agents remain geo-fenced.** Muse, Gemini's agent, Dots (personal) and Duet were still closed to UK consumers on 2026-11-01, with uneven access expected through 2027. Self-host is the only path around that fence — a direct Arova advantage. | Nov-2026 access reporting |
| **Claude Duet's shape is now public**: a separate app that messages you first, a morning brief, checks your apps in the background, voice input, Claude memory + skills + connected apps. The "proactive morning brief" is a product pattern, not a demo. | Anthropic primary; Zapier explainer 2026-11-04 |
| **Agent interoperability arrived**: OpenAI Codex CLI `/import` brings setups and chats over from Claude Code or Cursor. Cross-tool import/export is becoming table stakes for tools, not just data. | Nov-2026 release notes |
| **Reliability ops matured into a named discipline**: golden-task regression suites run continuously in CI, pass rate + **revision rate** as the dashboard pair, incidents promoted into the suite, suites refreshed so they do not drift from production (MLflow guide, harness-with-CI-gates writeups, "stage 3 = evals running continuously"). | MLflow 2026-05; Aug–Sep 2026 harness pieces |
| **Agent memory became a product category**: Mem0 (LLM-extracted facts reconciled automatically), Zep (temporal knowledge graph + governance), Letta (agents edit their own git-tracked memory). The reviewable-memory position Arova took is now contested from three directions. | Jul–Aug 2026 comparisons |
| **Observability is a bought layer**: LangSmith / Langfuse / Braintrust sell tracing, cost/latency spans and production evals; a 2026 benchmark names LangSmith the low-overhead leader. Tracing-by-default is now expected in any serious deployment. | Sep–Oct 2026 tool surveys |
| **Governance is still a paid layer** (Agent 365 at $15/user/mo), and n8n shipped human-in-the-loop controls for AI tool calls — approval UX is now a feature, not a governance afterthought. | vendor pages |

**Steady-state reads that still hold:** reliability remains the open wound (OSWorld 2.0 best ≈44%
vs 72% human); substrate is table stakes; the unserved position is governed, attributable
multi-agent work for a small team that owns the stack; the name collision ("Arova" is occupied by
three other companies) is still unresolved and still blocks public launch (D-26).

---

## 2. The audit — what Arova has and lacks, code-verified 2026-11-23

**Has and verified live:** durable queue + worker (enqueue/claim/lease/retry/dead-letter,
heartbeats, pause/resume, retention sweep), orgs/consults/handoffs with per-hop delegations,
reviewable org memory with temporal validity + hybrid trigram retrieval, triggers (hashed tokens,
202 + queued), channels (webhook + native Slack, signed ingress, event-id idempotency, delivery
ledger), evals + suites, registry, local OS sandbox (WSL provider), audit export, tool loop +
citation ledger, stop-means-stop, run contract, version pinning + effects ledger, policy gateway +
tool_calls ledger, credential vault, saved skills with drafts/activation/telemetry, MCP
(discovery, person-initiated calls, loop-integrated reads), goals/watches/attention, db bootstrap.

**Lacks — every line verified in the tree today:**

| # | Gap | Where verified |
|---|---|---|
| G1 | **Multimodal input** — the gateway strips image models from the chat catalogue and accepts text only; no image or file input exists anywhere in chat | `model-gateway.ts` NON_CHAT filter; no attachment handling |
| G2 | **Files and artifacts** — no attachment/artifact storage in the schema; runs produce text steps only | no blob/attachment tables |
| G3 | **The Connectors tab is a fake catalogue** — hardcoded decorative cards (Gmail/Slack/Notion…) that state "nothing is authorised"; the real connector path (MCP + channels + triggers) is invisible beside it | `page.tsx` toolCatalog |
| G4 | **No proactive digest** — attention items, goal failures, dead-lettered jobs and eval drift accumulate silently unless a human opens the board; competitors sell the morning brief | no digest job anywhere |
| G5 | **No reliability ops loop** — suites run on demand only: no trend view, no revision rate, no CI regression gate, no "promote this incident into the suite" action | `suite.ts` has no trend/CI surface |
| G6 | **No per-step cost attribution** — tokens per provider per day exist; no per-run/per-step cost, no $ view, no pricing table | `budget.ts` counts calls only |
| G7 | **Thin governance** — roles are owner/member only; no viewer/admin split, no per-seat policy admin, no retention UI (sweep is env-only), no sign-in enforcement toggle | `auth-sessions.ts` Actor type |
| G8 | **No memory-capture loop from chat** — memory proposals exist only in org-channel briefs; regular conversations propose nothing; Mem0-style "capture with review" is absent | `MEMORY_SYSTEM` used in briefs only |
| G9 | **No message edit/branch/resend** — history is append-only pagination; editing a turn and re-running from there (the pattern every chat product ships) does not exist | no edit/branch action |
| G10 | **One channel family** — Slack + generic webhook only; Teams, Telegram and email adapters (Hermes ships all three, email with sender auth) absent | `channels.ts` kinds |
| G11 | **No workspace import/restore** — export exists (audit JSON), nothing reads it back | export route has no inverse |
| G12 | **No voice input** — Duet ships voice; nothing here captures or transcribes audio | no audio path |
| G13 | **No tracing spans / OTel export** — runs have steps, but no cost/latency spans per call and no export to the observability stack buyers already run | events only |
| G14 | **A real computer** — deliberately deferred behind the owner's Phase-1 E2B measurements (parity §8.2); the sandbox refuses honestly | `sandbox.ts` provider refusal |

**Deliberate non-goals (re-confirmed, not gaps):** a workflow canvas (n8n's territory), 4k OAuth
connectors, cross-workspace agent federation (D-15.3 hermeticity), a frontier model, hosted
billing, 24/7 consumer proactivity beyond the digest.

---

## 3. The new spec list

Numbering continues the main line (specs 01–41 exist). Each spec below carries the repo's format:
problem, scope, acceptance. Order is market-value × buildable-here, re-ranked from §8.2 with
today's evidence.

### Spec 42 — Multimodal input and files
**Problem.** Every competitor's chat accepts images and files; Arova's seats are text-bound, so
whole job classes (screenshot review, invoice reading, document Q&A) are impossible. The gateway
actively excludes image models.
**Scope.** `messages.attachments` (stored bytes under the workspace's own storage dir, mime+size
caps, no executable types), image content parts through the OpenAI-compatible gateway when the
served model accepts them, file text extraction for common types (pdf/docx/csv via pure parsers
where possible, honest refusal otherwise), attachments rendered in the board, deletion with the
message. Budget counts multimodal tokens as reported.
**Acceptance.** A seat can be shown an image and answer a question about it with the reason named
in metadata; a PDF's text reaches the model; oversized/Executable uploads refuse with the rule;
without a vision-capable model the UI says so instead of sending and failing.
**Honest boundary.** No image *generation*; no OCR beyond what a parser or the model provides.

### Spec 43 — Connectors, MCP-first (retire the fake catalogue)
**Problem.** The Connectors tab is decorative fiction — hardcoded cards that say nothing is
authorised — while the real integration surface (MCP servers, channels, triggers, the vault) hides
in other tabs. Competitors win the connector story by default.
**Scope.** Replace the fake catalogue with a real one: a connectors registry where an entry is an
MCP server binding (url + vault credential label + owner seat), a channel, or a trigger — with
health (last discovery, last delivery, last event), and one UI verb each (Discover / Test / Revoke).
OAuth apps stay out until the owner decides on real OAuth clients; the tab says that in one line.
**Acceptance.** Every card in Connectors is backed by a live row; zero decorative cards; the
registry passes a "no lies" test (a connector shown must answer a real request or show its refusal).

### Spec 44 — Proactive digest
**Problem.** Duet messages you first; Arova's human must open the board to learn that a watch
failed at 03:00 or three jobs dead-lettered. Attention exists but has no outbound voice of its own.
**Scope.** A scheduled digest job (cadence per workspace, default weekday morning in the
workspace's timezone): attention open/urgent, goals paused by the ladder, jobs dead-lettered since
last digest, eval drift since last digest, queue health — summarised model-free (deterministic
text, no key needed) and delivered to a chosen channel; optional model polish when a key exists.
Delivered-through-channels means Slack/webhook inherit for free.
**Acceptance.** With no model key configured, the digest still ships and is honest; with one, it
names what a person should look at first; pause/kill and the fatigue rule apply as anywhere.

### Spec 45 — Reliability ops loop
**Problem.** The 2026 reliability playbook is continuous evals: pass rate + revision rate as
dashboard pair, regression gate in CI, incidents promoted into the suite. Arova's suites are
run-on-demand with a single pass-rate number — the market claim ("honest") is still not measured.
**Scope.** Suite history rows (every suite run stored with its counts), a pass-rate trend line per
suite and per seat, `npm run evals -- --suite X` CLI gate for CI (exit non-zero below threshold),
"promote to eval task" action on a failed run (copies prompt + the answer that failed as expected-
fragment negative test), and a revision-rate column (re-runs after a failure).
**Acceptance.** A suite run twice shows two history points and a trend; CI gate exits 1 below the
configured pass rate; a failed run becomes an eval task in one action; all without a model key
(SKIPPED rows are honest, not silent).

### Spec 46 — Cost attribution
**Problem.** Budget counts calls; every competitor shows spend. A small team self-hosting needs
"what did yesterday cost" per seat and per run, or the daily-call ceiling is a blunt guess.
**Scope.** A pricing table in env/DB (`PROVIDERS` + `<NAME>_PRICE_IN`/`_PRICE_OUT` per million
tokens), per-run cost computed from recorded usage, a cost column on runs and the usage dashboard,
weekly cost per seat in the registry. Estimated-vs-reported stays visible.
**Acceptance.** A run's cost is derivable from stored rows alone; the dashboard reconciles with
the usage table; no pricing configured → the UI says costs are unpriced rather than showing $0.

### Spec 47 — Governance pack
**Problem.** Agent 365 sells governance as a layer; Arova has two roles and env-only retention.
Self-host teams still need viewer separation, policy admin and retention in the product.
**Scope.** Roles extended to owner/operator/viewer (viewer reads the board, cannot POST actions;
operator runs but cannot manage people/connections); retention policies per workspace in Settings
(retention UI over the worker's existing sweep); sign-in enforcement toggle (require OIDC, cookie
demoted to diagnostics); audit export gains a schedule (weekly to a channel).
**Acceptance.** A viewer's every write attempt is refused with the role named; retention set in UI
is what the worker enforces (no env drift); enforcement toggle flips the cookie path with one
documented restart.

### Spec 48 — Memory capture loop
**Problem.** Mem0's core is capture-with-reconciliation; Arova only proposes memories from org
briefs. Regular conversations — where the real decisions are said — propose nothing.
**Scope.** Post-reply memory proposals: the distiller (already built for channels, `MEMORY_SYSTEM`)
runs as an optional bounded pass over a seat thread's turn pair, producing candidate notes into the
same review surface the channel uses (accept → memory, dismiss → gone, supersede flows unchanged);
capture is per-seat opt-in (capability), budget-counted, and never auto-writes.
**Acceptance.** With the capability on, a decision said in chat appears as a reviewable proposal in
one bounded call; with the budget off or the capability off, nothing is proposed and the UI says
why; the org-isolation rule is inherited unchanged.

### Spec 49 — Channel adapters pack
**Problem.** Slack shipped; Teams, Telegram and email (Hermes ships email with sender auth by
default) are the remaining distribution surfaces, and delivery retries are a bare ledger.
**Scope.** Teams incoming-webhook outbound + Teams-style inbound verification; Telegram bot
(token-scoped, text-only inbound); email inbound with sender authorization + SPF/DKIM-adjacent
verification posture (Hermes' default is the bar); a delivery retry policy (backoff, max attempts,
dead-letter into the delivery ledger, surfaced in the digest).
**Acceptance.** Each adapter verified against a scripted mock (the Slack pattern); a failing
delivery retries per policy and lands in the digest; no adapter pretends inbound verification it
does not perform.

### Spec 50 — Conversation editing and branching
**Problem.** Every chat product ships edit-and-resend; Arova's transcript is append-only, so a
mistyped instruction is permanent clutter and a wrong direction cannot be re-run from the turn
before it.
**Scope.** Edit-and-resend on a user turn: the original is kept (append-only is an invariant), the
edited turn opens a **branch** marked in metadata; branch navigation in the thread; runs stay
lineage-linked; supersession-style display (the edited turn supersedes its predecessor in its own
branch only).
**Acceptance.** Editing never mutates the original row; a branch renders and navigates; the audit
stream shows the edit as an event; the streaming and unary paths behave identically (existing
invariant).

### Spec 51 — Workspace import/restore
**Problem.** Export produces an audit JSON nobody can read back in; disaster recovery and
migration between machines are manual SQL.
**Scope.** Full export mode (the audit export stays default; `?mode=full` adds messages, runs,
steps, memories, routines — still excluding vault envelopes and tokens); an import action that
restores a full export into a **new empty workspace** with id-rerouting, and a preflight that
refuses a foreign or partial file with the reason.
**Acceptance.** Export on machine A → import on machine B yields a working workspace (spec drive);
secrets never appear in any export; the audit-only default is unchanged.

### Spec 52 — Voice input
**Problem.** Duet ships voice; Arova's board is text-only at the input.
**Scope.** Browser microphone capture (MediaRecorder) → transcription via an env-driven provider
(the same `<NAME>_BASE_URL/_API_KEY` pattern — Whisper-compatible endpoints only) → text into the
existing send path; transcription errors refuse out loud; nothing is stored beyond the text.
**Acceptance.** With a transcription provider configured, dictation lands in the draft box for
review before sending (never auto-send); without one, the mic button states exactly what is
missing. Lowest priority of the list — ship after 42–45.

---

## 4. Priority order (market value × buildable-here, no new substrate required)

1. **43 Connectors MCP-first** — pure UI/registry work, kills the biggest honesty liability.
2. **44 Proactive digest** — the Duet pattern, buildable model-free; makes attention audible.
3. **45 Reliability ops loop** — converts "honest by design" into "honest and measured"; CI gate.
4. **46 Cost attribution** — self-host teams' first question; derivable from stored rows.
5. **47 Governance pack** — the Agent-365-shaped slice; roles + retention UI + enforcement.
6. **48 Memory capture loop** — the Mem0 answer, reviewable by construction.
7. **42 Multimodal + files** — biggest reach, needs vision-capable model + parsers.
8. **49 Channel adapters** — Teams/Telegram/email per the Slack pattern.
9. **50 Editing/branching**, **51 import/restore**, **52 voice** — product polish, last.

---

## 5. Sources (this refresh)

- [Hermes vs OpenClaw: which open source agent to run](https://vercel.com/i/openclaw-vs-hermes-agent) (2026-11-01)
- [Zapier — What Is Claude Duet?](https://zapier.com/blog/claude-duet/) (2026-11-04)
- [Anthropic — Introducing Claude Duet](https://claude.com/resources/articles/claude-duet) (2026-10-21)
- [MLflow — AI Agent Evaluations: A Developer's Practical Guide](https://mlflow.org/articles/ai-agent-evaluations-a-developers-practical-guide) (2026-05)
- [Agent Evaluation Harness: Replay, Rubrics, CI Gates](https://medium.com/@Praxen/agent-evaluation-suites-that-actually-catch-failures-02f4e9ab0243) (2026-08)
- [mem0.ai — Mem0 vs Zep](https://mem0.ai/library/agent-memory/mem0-vs-zep) (2026-07)
- [Agenta — 7 Best Open-Source AI Agent Platforms in 2026](https://agenta.ai/blog/best-open-source-ai-agent-platforms) (2026-10)
- [LangChain — LLM observability tools](https://www.langchain.com/resources/llm-observability-tools) (2026)
- [Langfuse](https://langfuse.com) (2026)
- Prior briefs on this tree: `feature-parity.md` rev 2 (2026-10-28/29) and the restored
  `market-deep-dives/01–07` (through 2026-10-25).
