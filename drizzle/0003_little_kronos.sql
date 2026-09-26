CREATE TABLE "uploaded_images" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"filename" varchar(160) NOT NULL,
	"content_type" varchar(64) NOT NULL,
	"size" integer NOT NULL,
	"data" text NOT NULL,
	"uploaded_by" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
