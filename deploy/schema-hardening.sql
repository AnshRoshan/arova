-- Arova schema hardening for an existing database.
--
-- `src/db/schema.ts` is the source of truth; this file exists so a deployed database can be brought
-- forward without `drizzle-kit push --force`, which is destructive by design. Every statement is
-- idempotent, so running it twice is safe.
--
--   psql "$DATABASE_URL" -f deploy/schema-hardening.sql

-- Query paths the board runs on every load: one workspace, newest first.
CREATE INDEX IF NOT EXISTS messages_workspace_created_index ON messages (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS messages_team_created_index ON messages (team_id, created_at);
CREATE INDEX IF NOT EXISTS runs_workspace_started_index ON runs (workspace_id, started_at);
CREATE INDEX IF NOT EXISTS runs_status_started_index ON runs (status, started_at);
CREATE INDEX IF NOT EXISTS approvals_workspace_status_index ON approvals (workspace_id, status, created_at);
CREATE INDEX IF NOT EXISTS events_workspace_created_index ON events (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS delegations_workspace_created_index ON delegations (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS delegations_message_index ON delegations (message_id);
CREATE INDEX IF NOT EXISTS channel_deliveries_workspace_index ON channel_deliveries (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS eval_results_workspace_index ON eval_results (workspace_id, created_at);

-- Loose ids become real references. NOT VALID lets the constraint land without a long lock; the
-- validation below still refuses to complete if an orphan exists.
DO $$ BEGIN
  ALTER TABLE delegations ADD CONSTRAINT delegations_message_id_messages_id_fk
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE delegations VALIDATE CONSTRAINT delegations_message_id_messages_id_fk;

DO $$ BEGIN
  ALTER TABLE channel_deliveries ADD CONSTRAINT channel_deliveries_run_id_runs_id_fk
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE channel_deliveries VALIDATE CONSTRAINT channel_deliveries_run_id_runs_id_fk;

-- "local" was never a provider this build creates; an unset row must not imply a runtime exists.
ALTER TABLE sandboxes ALTER COLUMN provider SET DEFAULT 'unconfigured';

-- Nothing inserts a connection yet, so a row must not default to claiming a live account.
ALTER TABLE connections ALTER COLUMN status SET DEFAULT 'DISCONNECTED';

-- Spec 27: what a seat was told, and what it attempted.
CREATE TABLE IF NOT EXISTS agent_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version integer NOT NULL,
  instructions text NOT NULL DEFAULT '',
  capabilities jsonb,
  provider text NOT NULL DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_versions_agent_version_unique ON agent_versions (agent_id, version);
CREATE INDEX IF NOT EXISTS agent_versions_agent_index ON agent_versions (agent_id, created_at);

ALTER TABLE runs ADD COLUMN IF NOT EXISTS agent_version_id uuid;
DO $$ BEGIN
  ALTER TABLE runs ADD CONSTRAINT runs_agent_version_id_agent_versions_id_fk
    FOREIGN KEY (agent_version_id) REFERENCES agent_versions(id) ON DELETE SET NULL NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE runs VALIDATE CONSTRAINT runs_agent_version_id_agent_versions_id_fk;

CREATE TABLE IF NOT EXISTS external_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id uuid REFERENCES runs(id) ON DELETE SET NULL,
  agent_version_id uuid REFERENCES agent_versions(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_effects_status_check CHECK (status IN ('pending', 'succeeded', 'failed', 'uncertain'))
);
CREATE UNIQUE INDEX IF NOT EXISTS external_effects_idempotency_unique ON external_effects (workspace_id, idempotency_key);
CREATE INDEX IF NOT EXISTS external_effects_run_index ON external_effects (run_id);

-- Spec 28: a named suite over existing eval tasks, with its own call ceiling.
CREATE TABLE IF NOT EXISTS eval_suites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name text NOT NULL,
  task_ids jsonb NOT NULL DEFAULT '[]',
  call_ceiling integer NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'READY',
  passed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  errored integer NOT NULL DEFAULT 0,
  model_calls integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS eval_suites_workspace_name_unique ON eval_suites (workspace_id, name);
CREATE INDEX IF NOT EXISTS eval_suites_workspace_index ON eval_suites (workspace_id, created_at);
