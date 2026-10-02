ALTER TABLE "room_types" ALTER COLUMN "tax_rate_bp" SET DEFAULT 1750;
UPDATE "room_types" SET "tax_rate_bp" = 1750 WHERE "tax_rate_bp" = 1650;

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tax_rate_bp" integer;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tax_inclusive" boolean;
