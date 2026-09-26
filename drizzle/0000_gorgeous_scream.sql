CREATE TABLE "booking_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"booking_id" varchar(36) NOT NULL,
	"reference" varchar(32) NOT NULL,
	"action" varchar(64) NOT NULL,
	"note" text,
	"actor" varchar(64) DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"reference" varchar(32) NOT NULL,
	"room_type_id" varchar(64) NOT NULL,
	"room_type" varchar(120) NOT NULL,
	"check_in" varchar(10) NOT NULL,
	"check_out" varchar(10) NOT NULL,
	"adults" integer DEFAULT 1 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"nights" integer DEFAULT 1 NOT NULL,
	"nightly_rate" integer NOT NULL,
	"total_amount" integer NOT NULL,
	"guest_name" varchar(160) NOT NULL,
	"phone" varchar(40) NOT NULL,
	"email" varchar(180),
	"arrival" varchar(80),
	"requests" text,
	"extras" text DEFAULT '[]',
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"assigned_room" varchar(32),
	"invoice_number" varchar(64),
	"invoice_sent_at" timestamp with time zone,
	"amount_paid" integer DEFAULT 0 NOT NULL,
	"policy_version" varchar(32) DEFAULT '2026-07' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "gallery_images" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"title" varchar(160) NOT NULL,
	"category" varchar(80) DEFAULT 'Rooms' NOT NULL,
	"image_url" text NOT NULL,
	"alt_text" varchar(255) NOT NULL,
	"caption" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"invoice_number" varchar(64) NOT NULL,
	"booking_id" varchar(36),
	"booking_ref" varchar(32) NOT NULL,
	"guest_name" varchar(160) NOT NULL,
	"guest_email" varchar(180),
	"guest_phone" varchar(40),
	"room_type" varchar(120) NOT NULL,
	"check_in" varchar(10) NOT NULL,
	"check_out" varchar(10) NOT NULL,
	"nights" integer DEFAULT 1 NOT NULL,
	"subtotal" integer NOT NULL,
	"extras_total" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"total_amount" integer NOT NULL,
	"amount_paid" integer DEFAULT 0 NOT NULL,
	"balance_due" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'proforma' NOT NULL,
	"line_items_json" text DEFAULT '[]' NOT NULL,
	"payment_instructions" text,
	"sent_to_email" varchar(180),
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"category" varchar(80) NOT NULL,
	"description" text NOT NULL,
	"price" integer NOT NULL,
	"image_url" text NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"is_special" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"category" varchar(64) DEFAULT 'Event' NOT NULL,
	"day" varchar(16),
	"date" varchar(16),
	"time" varchar(80),
	"detail" text NOT NULL,
	"price_tag" varchar(80),
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_types" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"rate" integer NOT NULL,
	"total_inventory" integer DEFAULT 3 NOT NULL,
	"bed" varchar(80) NOT NULL,
	"sleeps" varchar(80) NOT NULL,
	"size" varchar(80) NOT NULL,
	"badge" varchar(80),
	"features" text DEFAULT '[]' NOT NULL,
	"images" text DEFAULT '[]' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_types_slug_unique" UNIQUE("slug")
);
