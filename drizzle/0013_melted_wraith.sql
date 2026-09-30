CREATE TABLE "expenses" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"category" varchar(32) DEFAULT 'other' NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"paid_to" varchar(160),
	"method" varchar(24) DEFAULT 'cash' NOT NULL,
	"receipt_url" text,
	"spent_on" varchar(10) NOT NULL,
	"approved_by" varchar(160),
	"created_by" varchar(160),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "night_audit" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"audit_date" varchar(10) NOT NULL,
	"rooms_sold" integer DEFAULT 0 NOT NULL,
	"rooms_available" integer DEFAULT 0 NOT NULL,
	"occupancy_bp" integer DEFAULT 0 NOT NULL,
	"adr" integer DEFAULT 0 NOT NULL,
	"revpar" integer DEFAULT 0 NOT NULL,
	"room_revenue" integer DEFAULT 0 NOT NULL,
	"pos_revenue" integer DEFAULT 0 NOT NULL,
	"total_revenue" integer DEFAULT 0 NOT NULL,
	"total_expenses" integer DEFAULT 0 NOT NULL,
	"net_profit" integer DEFAULT 0 NOT NULL,
	"run_by" varchar(160),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "night_audit_audit_date_unique" UNIQUE("audit_date")
);
--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN "weekend_price" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN "extra_bed_price" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN "cleaning_fee" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN "tax_rate_bp" integer DEFAULT 1650 NOT NULL;--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN "min_nights" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN "weekly_discount_bp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN "monthly_discount_bp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN "amenities_charges" text DEFAULT '[]' NOT NULL;