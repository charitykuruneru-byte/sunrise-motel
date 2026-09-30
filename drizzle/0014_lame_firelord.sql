CREATE TABLE "room_blocks" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"room_number" varchar(16) NOT NULL,
	"room_type_id" varchar(64),
	"start_date" varchar(10) NOT NULL,
	"end_date" varchar(10) NOT NULL,
	"reason" varchar(24) DEFAULT 'maintenance' NOT NULL,
	"note" text,
	"created_by" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
