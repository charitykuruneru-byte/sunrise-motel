CREATE TABLE "faqs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"question" varchar(240) NOT NULL,
	"answer" text NOT NULL,
	"category" varchar(40) DEFAULT 'general' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"updated_by_label" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"booking_id" varchar(36),
	"guest_id" varchar(36),
	"guest_name" varchar(160) NOT NULL,
	"stay_month" varchar(16),
	"rating" integer DEFAULT 5 NOT NULL,
	"comment" text,
	"source" varchar(16) DEFAULT 'direct' NOT NULL,
	"source_url" varchar(300),
	"is_published" boolean DEFAULT true NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"collected_via" varchar(24) DEFAULT 'check_out' NOT NULL,
	"published_by_label" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_sessions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"booking_id" varchar(36) NOT NULL,
	"guest_id" varchar(36),
	"room_number" varchar(16) NOT NULL,
	"guest_name" varchar(160) NOT NULL,
	"qr_token_hash" varchar(128) NOT NULL,
	"pin_hash" text,
	"pin_salt" text,
	"pin_attempts" integer DEFAULT 0 NOT NULL,
	"pin_locked_until" timestamp with time zone,
	"opened_via" varchar(16) DEFAULT 'qr' NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_reason" varchar(120)
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"full_name" varchar(160),
	"email" varchar(180),
	"phone" varchar(40),
	"check_in" varchar(10) NOT NULL,
	"check_out" varchar(10) NOT NULL,
	"room_type_id" varchar(64),
	"room_type" varchar(120),
	"adults" integer DEFAULT 1 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"note" text,
	"status" varchar(16) DEFAULT 'waiting' NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activation_tokens" ADD COLUMN "otp_hash" varchar(128);--> statement-breakpoint
ALTER TABLE "activation_tokens" ADD COLUMN "otp_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activation_tokens" ADD COLUMN "otp_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "activation_tokens" ADD COLUMN "otp_last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activation_tokens" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activation_tokens" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guest_accounts" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guest_accounts" ADD COLUMN "messaging_muted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guest_accounts" ADD COLUMN "signup_source" varchar(24) DEFAULT 'desk' NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_sessions" ADD COLUMN "user_agent" varchar(240);--> statement-breakpoint
ALTER TABLE "guest_sessions" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_sessions" ADD COLUMN "revoked_reason" varchar(120);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "channel" varchar(16) DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "room_session_id" varchar(36);