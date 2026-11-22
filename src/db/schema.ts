import { pgTable, text, timestamp, integer, boolean, uuid, jsonb, uniqueIndex, index, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => uuid("id").defaultRandom().primaryKey();
const created = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const workspaces = pgTable("workspaces", { id: id(), name: text("name").notNull().default("Personal workspace"), timezone: text("timezone").notNull().default("America/New_York"),
  /** The designated creator ("Godfather"). Null means no tier is in force and any seat may propose
   * an organisation for your confirmation, which is how the demo behaved before Feature 11. */
  creatorAgentId: uuid("creator_agent_id"),
  /** Spec 30 (durable work engine): set by pauseWork; the job claim joins on it being null, so a
   * paused workspace's queued jobs wait without anyone having to poll for a flag in the request path. */
  pausedAt: timestamp("paused_at", { withTimezone: true }), createdAt: created() });
export const teams = pgTable("teams", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), name: text("name").notNull(), brief: text("brief").notNull().default(""),
  // Plain uuids, not FKs: agents already references teams, and a reference back would be a cycle the
  // push cannot create. Both are cleared in the same transaction that deletes the seat.
  creatorAgentId: uuid("creator_agent_id"), leadAgentId: uuid("lead_agent_id"), createdAt: created() }, t => [uniqueIndex("teams_workspace_name_unique").on(t.workspaceId, t.name)]);
export const agents = pgTable("agents", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }), managerId: uuid("manager_id").references((): AnyPgColumn => agents.id, { onDelete: "set null" }), name: text("name").notNull(), role: text("role").notNull(), instructions: text("instructions").notNull().default(""), avatar: text("avatar").notNull().default("sparkles"), color: text("color").notNull().default("violet"), status: text("status").notNull().default("ACTIVE"), provider: text("provider").notNull().default("auto"), capabilities: jsonb("capabilities").$type<Record<string, unknown>>(), createdAt: created(), deletedAt: timestamp("deleted_at", { withTimezone: true }) });
/**
 * What a seat was told and allowed at a moment. Instructions are edited in place on the agent; a run
 * pins the version it actually used, so a later edit cannot rewrite the past. Runs created before
 * this table existed carry a null version, and the UI says so rather than guessing.
 */
export const agentVersions = pgTable("agent_versions", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }), version: integer("version").notNull(), instructions: text("instructions").notNull().default(""), capabilities: jsonb("capabilities").$type<Record<string, unknown>>(), provider: text("provider").notNull().default("auto"), createdAt: created() }, t => [uniqueIndex("agent_versions_agent_version_unique").on(t.agentId, t.version), index("agent_versions_agent_index").on(t.agentId, t.createdAt)]);
/** A row belongs to one seat's thread or to an organisation's channel — never both, never neither. */
export const messages = pgTable("messages", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }), teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }), role: text("role").notNull(), content: text("content").notNull(), kind: text("kind").notNull().default("message"), metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}), createdAt: created() }, t => [check("messages_addressed_to_one_subject", sql`(${t.agentId} is not null) <> (${t.teamId} is not null)`), index("messages_workspace_created_index").on(t.workspaceId, t.createdAt), index("messages_team_created_index").on(t.teamId, t.createdAt)]);
export const routines = pgTable("routines", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }), name: text("name").notNull(), description: text("description").notNull(), schedule: text("schedule").notNull(), timezone: text("timezone").notNull().default("America/New_York"), enabled: boolean("enabled").notNull().default(true), icon: text("icon").notNull().default("sparkles"), lastRunAt: timestamp("last_run_at", { withTimezone: true }), nextRunAt: timestamp("next_run_at", { withTimezone: true }), lastStatus: text("last_status"), /** Consecutive runs that produced nothing. Ten and the routine switches itself off (fatigue.ts). */ failStreak: integer("fail_streak").notNull().default(0), createdAt: created() }, t => [index("routines_due_index").on(t.enabled, t.nextRunAt)]);
export const runs = pgTable("runs", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }), routineId: uuid("routine_id").references(() => routines.id, { onDelete: "set null" }), /** The instructions/capabilities this run actually used; null for runs before agent_versions. */ agentVersionId: uuid("agent_version_id").references(() => agentVersions.id, { onDelete: "set null" }), title: text("title").notNull(), status: text("status").notNull().default("QUEUED"), summary: text("summary").notNull().default(""), /** What started this run — a person typing, a schedule firing, or a trigger calling in (D-17). */ initiator: text("initiator").notNull().default("person"), idempotencyKey: text("idempotency_key"), /** Spec 46 — tokens this run actually spent, stamped by its runner where known; cost is derivable from these plus the pricing env, and "unpriced" is a state, never $0. */ inputTokens: integer("input_tokens"), outputTokens: integer("output_tokens"), startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(), completedAt: timestamp("completed_at", { withTimezone: true }) }, t => [uniqueIndex("runs_idempotency_unique").on(t.workspaceId, t.idempotencyKey), index("runs_workspace_started_index").on(t.workspaceId, t.startedAt), index("runs_status_started_index").on(t.status, t.startedAt)]);

/**
 * A side effect written down before it is attempted. `pending` means the attempt began; `succeeded`
 * and `uncertain` are terminal for automatic retries — the same key returns the row and does not run
 * again. `uncertain` is the honest state for a timeout: something may have happened. Read-only tools
 * do not create rows; they stay on the audit event.
 */
export const externalEffects = pgTable("external_effects", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
  agentVersionId: uuid("agent_version_id").references(() => agentVersions.id, { onDelete: "set null" }),
  idempotencyKey: text("idempotency_key").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("pending"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: created(),
}, t => [uniqueIndex("external_effects_idempotency_unique").on(t.workspaceId, t.idempotencyKey), index("external_effects_run_index").on(t.runId), check("external_effects_status_check", sql`${t.status} in ('pending', 'succeeded', 'failed', 'uncertain')`)]);
export const runSteps = pgTable("run_steps", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }), title: text("title").notNull(), detail: text("detail").notNull().default(""), status: text("status").notNull().default("COMPLETED"), createdAt: created() });
export const approvals = pgTable("approvals", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }), title: text("title").notNull(), detail: text("detail").notNull(), risk: text("risk").notNull().default("WRITE"), status: text("status").notNull().default("PENDING"),
  /** Spec 40 — the approval token's rules (policy.ts): one decision, expiring, bound to the exact ask. */
  argumentsHash: text("arguments_hash").notNull().default(""), target: text("target").notNull().default(""), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull().defaultNow(), consumedAt: timestamp("consumed_at", { withTimezone: true }), createdAt: created() }, t => [index("approvals_workspace_status_index").on(t.workspaceId, t.status, t.createdAt)]);
export const connections = pgTable("connections", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }), slug: text("slug").notNull(), /** No connector exists yet; a row must not claim a live account by default. */ status: text("status").notNull().default("DISCONNECTED"), createdAt: created() }, t => [uniqueIndex("connections_agent_slug_unique").on(t.agentId, t.slug)]);
export const sandboxes = pgTable("sandboxes", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }).unique(), provider: text("provider").notNull().default("unconfigured"), status: text("status").notNull().default("PAUSED"), minutesUsed: integer("minutes_used").notNull().default(0), createdAt: created() });
export const events = pgTable("events", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), agentId: uuid("agent_id"), type: text("type").notNull(), detail: text("detail").notNull().default(""), createdAt: created() }, t => [index("events_workspace_created_index").on(t.workspaceId, t.createdAt)]);
export const modelUsage = pgTable("model_usage", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), provider: text("provider").notNull(), day: text("day").notNull(), calls: integer("calls").notNull().default(0), inputTokens: integer("input_tokens").notNull().default(0), outputTokens: integer("output_tokens").notNull().default(0), estimated: boolean("estimated").notNull().default(true), createdAt: created() }, t => [uniqueIndex("model_usage_workspace_provider_day_unique").on(t.workspaceId, t.provider, t.day)]);
/** One agent asking another on the user's behalf. Every row is a real model call, so it is auditable and counted. */
export const delegations = pgTable("delegations", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }), fromAgentId: uuid("from_agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }), toAgentId: uuid("to_agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }), mode: text("mode").notNull().default("consult"), question: text("question").notNull(), answer: text("answer").notNull().default(""), model: text("model").notNull().default(""), inputTokens: integer("input_tokens").notNull().default(0), outputTokens: integer("output_tokens").notNull().default(0), createdAt: created() }, t => [index("delegations_workspace_created_index").on(t.workspaceId, t.createdAt), index("delegations_message_index").on(t.messageId)]);
/**
 * What an organisation decided and wants kept. Scoped to a team and never global, because the rule
 * this product is built on is that one company's memory must not lead into another. `supersedes`
 * replaces a corrected fact instead of arguing with it, and `source_ids` keeps every note traceable
 * to the channel posts it stands on. Retrieval is Postgres' own full-text index — this server has no
 * pgvector, so the product says "keyword memory" rather than implying semantic recall.
 */
export const memories = pgTable("memories", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }), agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }), kind: text("kind").notNull().default("note"), text: text("text").notNull(), sourceIds: jsonb("source_ids").$type<string[]>().notNull().default([]), supersedes: uuid("supersedes").references((): AnyPgColumn => memories.id, { onDelete: "set null" }), pinned: boolean("pinned").notNull().default(false),
  /** Spec 34 (org memory v2): temporal validity. A note that has not started being true, or has
   * stopped, is excluded from retrieval rather than outranked — a lapsed fact must not compete. */
  validFrom: timestamp("valid_from", { withTimezone: true }), validTo: timestamp("valid_to", { withTimezone: true }), lastUsedAt: timestamp("last_used_at", { withTimezone: true }), hits: integer("hits").notNull().default(0), createdAt: created() }, t => [index("memories_team_index").on(t.teamId), index("memories_search_index").using("gin", sql`to_tsvector('english', text)`), index("memories_validity_index").on(t.workspaceId, t.validFrom, t.validTo)]);
/**
 * A bearer token that lets something outside the app brief one organisation. The token is scoped
 * to a single org. Routines also have an in-process worker; this token is the door for an event
 * that is not a clock. `lastFiredAt` backs the short cooldown that stops one webhook loop spending
 * the whole day's model budget. The token is stored as a sha-256 digest (spec 40): a leaked
 * `triggers` row must not hand back a working credential, and `token_preview` is all the UI shows.
 */
export const triggers = pgTable("triggers", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }), token: text("token").notNull(), tokenPreview: text("token_preview").notNull().default(""), label: text("label").notNull().default("trigger"), enabled: boolean("enabled").notNull().default(true), lastFiredAt: timestamp("last_fired_at", { withTimezone: true }), hits: integer("hits").notNull().default(0), createdAt: created() }, t => [uniqueIndex("triggers_token_unique").on(t.token), index("triggers_team_index").on(t.teamId)]);

/**
 * Proof of life for whatever drives the scheduler. One row per driver ("worker" = the in-process loop
 * started by instrumentation, "cron" = an outside caller hitting /api/cron). The UI reads these rows to
 * say whether routines are really being watched right now, instead of claiming it.
 */
export const schedulerHeartbeats = pgTable("scheduler_heartbeats", {
  source: text("source").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  lastTickAt: timestamp("last_tick_at", { withTimezone: true }).defaultNow().notNull(),
  ticks: integer("ticks").notNull().default(0),
  lastClaimed: integer("last_claimed").notNull().default(0),
  totalClaimed: integer("total_claimed").notNull().default(0),
  lastError: text("last_error"),
});

/**
 * Feature 15 — signed-in people. A user is one identity from one issuer; `sub` is only unique
 * inside that issuer, so the pair is the key and the email is data, never the key.
 */
export const users = pgTable("users", {
  id: id(),
  issuer: text("issuer").notNull(),
  subject: text("subject").notNull(),
  email: text("email").notNull().default(""),
  name: text("name").notNull().default(""),
  picture: text("picture").notNull().default(""),
  createdAt: created(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
}, t => [uniqueIndex("users_issuer_subject_unique").on(t.issuer, t.subject)]);

/** Membership is per workspace: the first person in is the owner, and that is a stored row, not a guess. */
export const memberships = pgTable("memberships", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  addedAt: created(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
}, t => [index("memberships_workspace_index").on(t.workspaceId), uniqueIndex("memberships_workspace_user_unique").on(t.workspaceId, t.userId)]);

/** Only the hash of the browser's token is stored — a leaked table must not mint sessions. */
export const sessions = pgTable("sessions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  createdAt: created(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, t => [uniqueIndex("sessions_token_hash_unique").on(t.tokenHash), index("sessions_user_index").on(t.userId)]);

/**
 * An external surface the workspace can post results to and, when it belongs to an organisation,
 * receive work from. `target` is server-only: it is usually a Slack incoming-webhook URL, which is
 * itself a credential, so the board returns only its hostname. The inbound token is a second
 * credential, scoped to one row and revocable by deleting it.
 */
export const channels = pgTable("channels", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("webhook"),
  target: text("target").notNull().default(""),
  token: text("token").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
  lastStatus: text("last_status"),
  lastError: text("last_error"),
  delivered: integer("delivered").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
  createdAt: created(),
}, t => [uniqueIndex("channels_token_unique").on(t.token), index("channels_workspace_index").on(t.workspaceId), index("channels_team_index").on(t.teamId)]);

/** Every attempt is a row, so "the Slack post failed" is evidence, not a story. */
export const channelDeliveries = pgTable("channel_deliveries", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  direction: text("direction").notNull().default("out"),
  event: text("event").notNull(),
  status: text("status").notNull(),
  detail: text("detail").notNull().default(""),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
  createdAt: created(),
}, t => [index("channel_deliveries_channel_index").on(t.channelId, t.createdAt), index("channel_deliveries_workspace_index").on(t.workspaceId, t.createdAt)]);

/**
 * A fixed task and the answer fragment that proves it. The score is deliberately a substring
 * check, not an LLM judge: a judge would add a second model call and a second unverifiable claim.
 */
export const evalTasks = pgTable("eval_tasks", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  expected: text("expected").notNull(),
  createdAt: created(),
});

/**
 * A named list of eval tasks with a cost ceiling. Running it stores its own counts, including the
 * number of model calls it actually spent, so the rate can name its scope instead of looking like a
 * benchmark. A suite with no scored task shows no percentage.
 */
export const evalSuites = pgTable("eval_suites", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  taskIds: jsonb("task_ids").$type<string[]>().notNull().default([]),
  callCeiling: integer("call_ceiling").notNull().default(10),
  /** READY before the first run; COMPLETE, STOPPED_AT_CEILING, or SKIPPED after it. */
  status: text("status").notNull().default("READY"),
  passed: integer("passed").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  errored: integer("errored").notNull().default(0),
  modelCalls: integer("model_calls").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: created(),
}, t => [uniqueIndex("eval_suites_workspace_name_unique").on(t.workspaceId, t.name), index("eval_suites_workspace_index").on(t.workspaceId, t.createdAt)]);

/**
 * Spec 45 — a suite's run history. The suite row holds only the latest counts; every run is also a
 * row here, so pass rate becomes a trend, a re-run after a failure becomes a revision, and a CI
 * gate can read the sequence instead of guessing from one row.
 */
export const suiteRuns = pgTable("suite_runs", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  suiteId: uuid("suite_id").notNull().references(() => evalSuites.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  passed: integer("passed").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  errored: integer("errored").notNull().default(0),
  modelCalls: integer("model_calls").notNull().default(0),
  trigger: text("trigger").notNull().default("person"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, t => [index("suite_runs_suite_index").on(t.suiteId, t.startedAt)]);

/** One measured attempt. `detail` holds the answer excerpt and the scorer's sentence. */
export const evalResults = pgTable("eval_results", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").notNull().references(() => evalTasks.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
  status: text("status").notNull(),
  score: integer("score").notNull().default(0),
  detail: text("detail").notNull().default(""),
  durationMs: integer("duration_ms").notNull().default(0),
  createdAt: created(),
}, t => [index("eval_results_task_index").on(t.taskId, t.createdAt), index("eval_results_workspace_index").on(t.workspaceId, t.createdAt)]);

/**
 * A research project is a question with a curated source list. Sources are fetched through the same
 * SSRF policy as web_fetch or pasted as an excerpt, and findings are claims that point at the
 * sources they stand on. Nothing here calls a model: collecting and citing works with no key.
 */
export const researchProjects = pgTable("research_projects", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  question: text("question").notNull().default(""),
  status: text("status").notNull().default("ACTIVE"),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [index("research_projects_workspace_index").on(t.workspaceId, t.createdAt)]);

export const researchSources = pgTable("research_sources", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => researchProjects.id, { onDelete: "cascade" }),
  url: text("url").notNull().default(""),
  host: text("host").notNull().default(""),
  title: text("title").notNull().default(""),
  excerpt: text("excerpt").notNull().default(""),
  note: text("note").notNull().default(""),
  tag: text("tag").notNull().default(""),
  pinned: boolean("pinned").notNull().default(false),
  addedBy: text("added_by").notNull().default("person"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  createdAt: created(),
}, t => [index("research_sources_project_index").on(t.projectId, t.createdAt), uniqueIndex("research_sources_project_url_unique").on(t.projectId, t.url).where(sql`${t.url} <> ''`)]);

export const researchFindings = pgTable("research_findings", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => researchProjects.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  sourceIds: jsonb("source_ids").$type<string[]>().notNull().default([]),
  createdAt: created(),
}, t => [index("research_findings_project_index").on(t.projectId, t.createdAt)]);

/**
 * Spec 30 — the durable work queue. The board tick and Run now only enqueue; a claimable row is
 * the unit of work. Terminal states are immutable: a retry is a new attempt of the same row, and
 * `idempotency_key` (unique per workspace) is how a repeated enqueue becomes a no-op instead of a
 * second brief. Ported from the 2026-11-22 parallel line, where it was live-verified end-to-end.
 */
export const jobs = pgTable("jobs", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), kind: text("kind").notNull(), subjectId: uuid("subject_id"), payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}), status: text("status").notNull().default("QUEUED"), attempts: integer("attempts").notNull().default(0), maxAttempts: integer("max_attempts").notNull().default(3), runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(), leaseUntil: timestamp("lease_until", { withTimezone: true }), workerId: text("worker_id"), runId: uuid("run_id"), lastError: text("last_error"), idempotencyKey: text("idempotency_key"), createdBy: text("created_by"), createdAt: created(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() }, t => [uniqueIndex("jobs_idempotency_unique").on(t.workspaceId, t.idempotencyKey), index("jobs_claim_index").on(t.status, t.runAt), index("jobs_workspace_created_index").on(t.workspaceId, t.createdAt)]);

/** Spec 30b — worker liveness. One row per worker process; the board and health read the newest
 * `last_seen_at` and call the queue worker stale when it is older than the heartbeat window. */
export const workerHeartbeats = pgTable("worker_heartbeats", { id: text("id").primaryKey(), pid: integer("pid").notNull(), startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(), lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow() });

/**
 * Spec 31b — one row per gateway decision, before execution, and its outcome, after. `rule` quotes
 * the reason; arguments are redacted (src/lib/mcp.ts redactArguments) before they land here, so a
 * credential can never be quoted. Writes come from the runTool action; the tool loop's own audit
 * stays on events (spec 21), because a loop step is not a person-initiated tool call.
 */
export const toolCalls = pgTable("tool_calls", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), agentId: uuid("agent_id"), tool: text("tool").notNull(), risk: text("risk").notNull(), decision: text("decision").notNull(), rule: text("rule").notNull().default(""), argsDigest: text("args_digest").notNull().default(""), args: jsonb("args").$type<Record<string, unknown>>(), status: text("status").notNull().default("DECIDED"), output: text("output"), error: text("error"), durationMs: integer("duration_ms"), runId: uuid("run_id"), createdAt: created() }, t => [index("tool_calls_workspace_index").on(t.workspaceId, t.createdAt)]);

/**
 * Spec 31e — sealed credentials. `envelope` is AES-256-GCM (src/lib/credentials.ts); there is no
 * read endpoint and no route that returns it — adapters receive decrypted values server-side only.
 */
export const credentials = pgTable("credentials", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), kind: text("kind").notNull().default("api"), label: text("label").notNull(), envelope: text("envelope").notNull(), createdBy: text("created_by"), lastUsedAt: timestamp("last_used_at", { withTimezone: true }), createdAt: created() }, t => [uniqueIndex("credentials_workspace_label_unique").on(t.workspaceId, t.label)]);

/** Spec 36a — a responsibility an agent checks on a cadence until a human says otherwise. */
export const goals = pgTable("goals", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), title: text("title").notNull(), description: text("description").notNull().default(""), successCriteria: text("success_criteria").notNull().default(""), cadence: text("cadence").notNull().default("Every day at 8:00 AM"), status: text("status").notNull().default("active"), lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }), nextCheckAt: timestamp("next_check_at", { withTimezone: true }), createdBy: text("created_by").notNull().default("person"), createdAt: created() });

/** Spec 36b — an observation on a source, through the fetch policy (allow-list, no private IPs). A watch never writes outward. */
export const watches = pgTable("watches", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }), title: text("title").notNull(), url: text("url").notNull(), condition: text("condition").notNull().default("changed"), comparator: text("comparator").notNull().default(""), cadence: text("cadence").notNull().default("Every hour"), lastHash: text("last_hash"), lastObservation: text("last_observation"), enabled: boolean("enabled").notNull().default(true), lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }), nextCheckAt: timestamp("next_check_at", { withTimezone: true }), failStreak: integer("fail_streak").notNull().default(0), lastError: text("last_error"), createdAt: created() }, t => [index("watches_due_index").on(t.enabled, t.nextCheckAt)]);

/** Spec 36c — one deduplicated item per observation, with evidence, never notification spam. */
export const attentionItems = pgTable("attention_items", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), kind: text("kind").notNull(), severity: text("severity").notNull().default("attention"), title: text("title").notNull(), body: text("body").notNull().default(""), evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}), dedupeKey: text("dedupe_key").notNull(), status: text("status").notNull().default("open"), lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(), createdAt: created(), resolvedAt: timestamp("resolved_at", { withTimezone: true }) }, t => [uniqueIndex("attention_dedupe_unique").on(t.workspaceId, t.kind, t.dedupeKey), index("attention_open_index").on(t.workspaceId, t.status)]);

/**
 * Spec 37a — a saved, versioned workflow. Versions are immutable rows; `current_version` points.
 * Scope: org (everyone), team (one team), seat (one agent). Tools are grants, intersected with the
 * seat's own at use — a skill can never widen access.
 */
export const skills = pgTable("skills", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), scope: text("scope").notNull().default("org"), teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }), agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }), name: text("name").notNull(), slug: text("slug").notNull(), description: text("description").notNull().default(""), /** draft skills are records under review: they never reach a prompt until activated. */ status: text("status").notNull().default("draft"), instructions: text("instructions").notNull(), toolGrants: jsonb("tool_grants").$type<string[]>().notNull().default([]), currentVersion: integer("current_version").notNull().default(1), sourceRunId: uuid("source_run_id"), /** Spec 41 — usage is a stored fact, not a guess: it says whether a skill earns its place. */ uses: integer("uses").notNull().default(0), lastUsedAt: timestamp("last_used_at", { withTimezone: true }), createdBy: text("created_by").notNull().default("person"), createdAt: created(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() }, t => [uniqueIndex("skills_workspace_slug_unique").on(t.workspaceId, t.slug), index("skills_scope_index").on(t.workspaceId, t.status)]);

/** Spec 37a — immutable versions: editing creates N+1; rollback repoints without rewriting history. */
export const skillVersions = pgTable("skill_versions", { id: id(), skillId: uuid("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }), version: integer("version").notNull(), instructions: text("instructions").notNull(), toolGrants: jsonb("tool_grants").$type<string[]>().notNull().default([]), notes: text("notes").notNull().default(""), createdAt: created() }, t => [uniqueIndex("skill_versions_unique").on(t.skillId, t.version)]);

/** Spec 35 — the native Slack transport (restored from the 2026-11-22 line): an external Slack app
 * mapped to one organisation. The bot token and signing secret are sealed (spec 31e's envelope);
 * allowed senders are the identity boundary. The org channel (spec 16) stays the durable record —
 * a Slack post is a projection of it. */
export const channelConnections = pgTable("channel_connections", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), kind: text("kind").notNull(), name: text("name").notNull(), /** Sealed JSON: { botToken, signingSecret } for slack; never returned. */ envelope: text("envelope").notNull(), /** The provider's workspace id (Slack team_id). */ externalId: text("external_id").notNull().default(""), allowedSenders: jsonb("allowed_senders").$type<string[]>().notNull().default([]), teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }), enabled: boolean("enabled").notNull().default(true), lastEventAt: timestamp("last_event_at", { withTimezone: true }), createdAt: created() }, t => [index("channel_connections_external_index").on(t.kind, t.externalId)]);

/** Spec 35b — idempotency: one row per external event id; a duplicate insert is a no-op, not a second brief. */
export const channelEvents = pgTable("channel_events", { id: id(), connectionId: uuid("connection_id").notNull().references(() => channelConnections.id, { onDelete: "cascade" }), externalId: text("external_id").notNull(), payloadHash: text("payload_hash").notNull(), status: text("status").notNull().default("RECEIVED"), createdAt: created() }, t => [uniqueIndex("channel_events_unique").on(t.connectionId, t.externalId)]);

/**
 * Spec 44 — the proactive digest. One row per workspace: a cadence and the channel that hears it.
 * The content is built model-free from stored facts (attention, paused watches, dead-lettered jobs,
 * queue health), so the morning brief ships even with no model key. Delivered through the same
 * channel contract as run reports; fatigue is the queue's own retry policy, not a special case.
 */
export const digests = pgTable("digests", { id: id(), workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }), cadence: text("cadence").notNull().default("Every weekday at 8:00 AM"), channelId: uuid("channel_id").references(() => channels.id, { onDelete: "set null" }), enabled: boolean("enabled").notNull().default(true), lastSentAt: timestamp("last_sent_at", { withTimezone: true }), nextSendAt: timestamp("next_send_at", { withTimezone: true }), createdAt: created() }, t => [index("digests_due_index").on(t.enabled, t.nextSendAt)]);
