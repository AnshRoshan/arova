CREATE TABLE "suite_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"suite_id" uuid NOT NULL,
	"status" text NOT NULL,
	"passed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"errored" integer DEFAULT 0 NOT NULL,
	"model_calls" integer DEFAULT 0 NOT NULL,
	"trigger" text DEFAULT 'person' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "suite_runs" ADD CONSTRAINT "suite_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suite_runs" ADD CONSTRAINT "suite_runs_suite_id_eval_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."eval_suites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suite_runs_suite_index" ON "suite_runs" USING btree ("suite_id","started_at");