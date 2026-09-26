import { defineConfig } from "drizzle-kit";

// Uses DATABASE_URL when present (Vercel + Neon), otherwise local dev DB.
// drizzle-kit migrate on Vercel reads this file, so it must NOT hardcode 127.0.0.1.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/sunrise_db",
  },
});
