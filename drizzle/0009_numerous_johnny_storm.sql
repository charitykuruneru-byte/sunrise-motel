CREATE TABLE "invitations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"email" varchar(180) NOT NULL,
	"name" varchar(160) NOT NULL,
	"role" varchar(32) NOT NULL,
	"account_type" varchar(16) DEFAULT 'staff' NOT NULL,
	"invited_by_id" varchar(36) NOT NULL,
	"invited_by_name" varchar(160) NOT NULL,
	"invited_by_email" varchar(180) NOT NULL,
	"invited_by_role" varchar(32) NOT NULL,
	"guest_id" varchar(36),
	"booking_id" varchar(36),
	"token_hash" varchar(64),
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"delivery_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff" ALTER COLUMN "role" SET DATA TYPE varchar(32);--> statement-breakpoint
ALTER TABLE "staff" ALTER COLUMN "role" SET DEFAULT 'staff';--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "actor_id" varchar(36);--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "actor_email" varchar(180);--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "actor_role" varchar(32);--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "target_id" varchar(64);--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "target_email" varchar(180);--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "invited_by" varchar(36);--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "is_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_active_email_unique" ON "invitations" USING btree (lower("email")) WHERE "invitations"."status" in ('pending', 'failed');--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_unique" ON "invitations" USING btree ("token_hash") WHERE "invitations"."token_hash" is not null;