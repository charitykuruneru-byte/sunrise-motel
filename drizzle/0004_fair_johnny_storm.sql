CREATE TABLE "activation_tokens" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"account_id" varchar(36) NOT NULL,
	"guest_id" varchar(36) NOT NULL,
	"purpose" varchar(24) DEFAULT 'activation' NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"otp_code" varchar(8),
	"channel" varchar(16) DEFAULT 'email' NOT NULL,
	"sent_to" varchar(180),
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folio_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"booking_id" varchar(36),
	"room_number" varchar(16),
	"category" varchar(24) DEFAULT 'order' NOT NULL,
	"description" varchar(200) NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"amount" integer NOT NULL,
	"order_id" varchar(36),
	"posted_by_label" varchar(160),
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"void_reason" text,
	"voided_by_label" varchar(160),
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_accounts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"guest_id" varchar(36) NOT NULL,
	"login_email" varchar(180),
	"login_phone" varchar(40),
	"password_hash" text,
	"password_salt" text,
	"status" varchar(24) DEFAULT 'invited' NOT NULL,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"invited_by_label" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_sessions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"account_id" varchar(36) NOT NULL,
	"guest_id" varchar(36) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"device_label" varchar(160),
	"ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"phone" varchar(40),
	"email" varchar(180),
	"country" varchar(80),
	"notes" text,
	"stay_count" integer DEFAULT 0 NOT NULL,
	"total_spent" integer DEFAULT 0 NOT NULL,
	"is_regular" boolean DEFAULT false NOT NULL,
	"is_no_show" boolean DEFAULT false NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_threads" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"booking_id" varchar(36),
	"room_number" varchar(16),
	"guest_id" varchar(36),
	"guest_account_id" varchar(36),
	"guest_name" varchar(160),
	"subject" varchar(200),
	"kind" varchar(24) DEFAULT 'message' NOT NULL,
	"priority" varchar(16) DEFAULT 'normal' NOT NULL,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"resolution_note" text,
	"escalated_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"thread_id" varchar(36) NOT NULL,
	"booking_id" varchar(36),
	"room_number" varchar(16),
	"guest_id" varchar(36),
	"direction" varchar(24) DEFAULT 'guest_to_desk' NOT NULL,
	"body" text NOT NULL,
	"kind" varchar(24) DEFAULT 'message' NOT NULL,
	"status" varchar(16) DEFAULT 'sent' NOT NULL,
	"sender_label" varchar(160),
	"read_by_staff_at" timestamp with time zone,
	"read_by_guest_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"channel" varchar(16) DEFAULT 'portal' NOT NULL,
	"template" varchar(64),
	"recipient" varchar(180),
	"subject" varchar(200),
	"body" text,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"provider_ref" varchar(160),
	"error" text,
	"guest_id" varchar(36),
	"booking_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"order_id" varchar(36) NOT NULL,
	"menu_item_id" varchar(36),
	"name" varchar(160) NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"amount" integer NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"order_number" varchar(24) NOT NULL,
	"booking_id" varchar(36),
	"room_number" varchar(16),
	"guest_id" varchar(36),
	"guest_account_id" varchar(36),
	"guest_name" varchar(160),
	"status" varchar(24) DEFAULT 'placed' NOT NULL,
	"service" varchar(24) DEFAULT 'room_service' NOT NULL,
	"note" text,
	"total" integer DEFAULT 0 NOT NULL,
	"placed_by_label" varchar(160),
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"rejected_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"booking_id" varchar(36),
	"reference" varchar(32),
	"amount" integer NOT NULL,
	"currency" varchar(8) DEFAULT 'MWK' NOT NULL,
	"channel" varchar(24) DEFAULT 'cash' NOT NULL,
	"txn_ref" varchar(96),
	"payer_name" varchar(160),
	"payer_phone" varchar(40),
	"status" varchar(24) DEFAULT 'pending_verification' NOT NULL,
	"claimed_by" varchar(16) DEFAULT 'guest' NOT NULL,
	"verified_by_label" varchar(160),
	"verified_at" timestamp with time zone,
	"rejected_reason" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_type_rates" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"room_type_id" varchar(64) NOT NULL,
	"label" varchar(120) NOT NULL,
	"kind" varchar(24) DEFAULT 'seasonal' NOT NULL,
	"start_date" varchar(10),
	"end_date" varchar(10),
	"min_nights" integer DEFAULT 1 NOT NULL,
	"nightly_rate" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"room_number" varchar(16) NOT NULL,
	"room_type_id" varchar(64) NOT NULL,
	"room_type" varchar(120) NOT NULL,
	"floor" varchar(16),
	"state" varchar(24) DEFAULT 'available' NOT NULL,
	"ooo_reason" text,
	"ooo_until" varchar(10),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_room_number_unique" UNIQUE("room_number")
);
--> statement-breakpoint
CREATE TABLE "service_tasks" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"room_number" varchar(16) NOT NULL,
	"booking_id" varchar(36),
	"guest_account_id" varchar(36),
	"kind" varchar(24) DEFAULT 'other' NOT NULL,
	"note" text,
	"requested_by" varchar(16) DEFAULT 'guest' NOT NULL,
	"requested_by_label" varchar(160),
	"assigned_to" varchar(160),
	"priority" varchar(16) DEFAULT 'normal' NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"due_by" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_by" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "assigned_room_id" varchar(36);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "guest_id" varchar(36);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "deposit_required" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "deposit_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "self_modified_count" integer DEFAULT 0 NOT NULL;