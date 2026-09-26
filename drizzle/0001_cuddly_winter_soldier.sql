CREATE TABLE "audit_log" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"action" varchar(96) NOT NULL,
	"entity" varchar(64) NOT NULL,
	"entity_id" varchar(64),
	"reference" varchar(32),
	"summary" text,
	"actor" varchar(32) DEFAULT 'system' NOT NULL,
	"actor_label" varchar(160),
	"ip" varchar(64),
	"metadata_json" text DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
