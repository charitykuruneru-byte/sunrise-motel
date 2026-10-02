ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "booking_add_on_price" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'posts_booking_add_on_price_nonnegative'
      AND conrelid = 'public.posts'::regclass
  ) THEN
    ALTER TABLE "posts"
      ADD CONSTRAINT "posts_booking_add_on_price_nonnegative"
      CHECK ("booking_add_on_price" IS NULL OR "booking_add_on_price" >= 0);
  END IF;
END
$$;
