ALTER TABLE "booking_events" ADD COLUMN "actor_id" varchar(36);--> statement-breakpoint
ALTER TABLE "booking_events" ADD COLUMN "actor_name" varchar(160);--> statement-breakpoint
ALTER TABLE "booking_events" ADD COLUMN "actor_email" varchar(180);--> statement-breakpoint
ALTER TABLE "booking_events" ADD COLUMN "actor_role" varchar(32);--> statement-breakpoint
CREATE UNIQUE INDEX "staff_email_identity_unique" ON "staff" USING btree (lower("email"));