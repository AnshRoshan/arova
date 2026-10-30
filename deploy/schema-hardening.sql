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
