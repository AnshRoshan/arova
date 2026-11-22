CREATE TABLE "channel_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"envelope" text NOT NULL,
	"external_id" text DEFAULT '' NOT NULL,
	"allowed_senders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"team_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_event_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "arguments_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "target" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "expires_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "consumed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "uses" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_events" ADD CONSTRAINT "channel_events_connection_id_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_connections_external_index" ON "channel_connections" USING btree ("kind","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_events_unique" ON "channel_events" USING btree ("connection_id","external_id");