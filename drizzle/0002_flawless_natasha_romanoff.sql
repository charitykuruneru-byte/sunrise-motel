CREATE TABLE "staff" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"staff_code" varchar(16) NOT NULL,
	"name" varchar(160) NOT NULL,
	"email" varchar(180) NOT NULL,
	"phone" varchar(40),
	"role" varchar(16) DEFAULT 'staff' NOT NULL,
	"password_hash" text NOT NULL,
	"password_salt" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_staff_code_unique" UNIQUE("staff_code"),
	CONSTRAINT "staff_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "booking_number" varchar(16);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "service_fee" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "extension_fee" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "discount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "assigned_staff_id" varchar(36);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "follow_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "follow_up_note" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "last_reminder_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "reminder_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;