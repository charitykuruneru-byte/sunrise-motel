ALTER TABLE "message_threads" ADD COLUMN "channel" varchar(16) DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "message_threads" ADD COLUMN "room_session_id" varchar(36);--> statement-breakpoint
ALTER TABLE "service_tasks" ADD COLUMN "channel" varchar(16) DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_tasks" ADD COLUMN "room_session_id" varchar(36);