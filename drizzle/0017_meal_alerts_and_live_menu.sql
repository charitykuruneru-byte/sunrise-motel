ALTER TABLE "menu_items"
  ADD COLUMN IF NOT EXISTS "meal_period" varchar(24),
  ADD COLUMN IF NOT EXISTS "prep_time_mins" integer NOT NULL DEFAULT 20;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "is_auto_nudge" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "nudge_type" varchar(32),
  ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "guest_phone" varchar(40);

CREATE TABLE IF NOT EXISTS "meal_notification_settings" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "meal_type" varchar(32) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "title" varchar(160) NOT NULL,
  "message" text NOT NULL,
  "start_time" varchar(5) NOT NULL,
  "end_time" varchar(5) NOT NULL,
  "popup_duration_minutes" integer DEFAULT 30 NOT NULL,
  "cta_text" varchar(80) DEFAULT 'View Live Menu' NOT NULL,
  "image_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "meal_notification_settings_type_idx"
  ON "meal_notification_settings" ("meal_type");

INSERT INTO "meal_notification_settings"
  ("id", "meal_type", "title", "message", "start_time", "end_time", "popup_duration_minutes", "cta_text")
SELECT gen_random_uuid()::text, defaults.*
FROM (VALUES
  ('breakfast', 'Breakfast time!', 'Order your breakfast now, ready in 20 minutes.', '06:30', '09:30', 30, 'View Breakfast Menu'),
  ('lunch', 'Lunch time!', 'Fresh lunch is being prepared. Browse today''s live menu.', '11:45', '13:30', 30, 'View Lunch Menu'),
  ('dinner', 'Dinner time!', 'Join us for dinner. See what the kitchen is serving tonight.', '18:00', '20:30', 30, 'View Dinner Menu'),
  ('late_night_preorder', 'Arriving late?', 'Pre-order dinner for your late arrival.', '22:40', '23:35', 30, 'Pre-order Dinner')
) AS defaults("meal_type", "title", "message", "start_time", "end_time", "popup_duration_minutes", "cta_text")
WHERE NOT EXISTS (
  SELECT 1
  FROM "meal_notification_settings" existing
  WHERE existing."meal_type" = defaults."meal_type"
);
