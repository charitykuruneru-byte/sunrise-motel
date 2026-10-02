import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { notificationLogTable } from "@/db/schema";
import { db } from "@/db";
import { malawiDatePart } from "@/lib/time";

export const dynamic = "force-dynamic";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "late_night_preorder", "custom"];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { mealType?: unknown; date?: unknown };
    const mealType = typeof body.mealType === "string" ? body.mealType : "";
    const date = typeof body.date === "string" ? body.date : "";
    if (!MEAL_TYPES.includes(mealType) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date !== malawiDatePart()) {
      return NextResponse.json({ error: "Meal alert and current Malawi date are required." }, { status: 400 });
    }
    await db.insert(notificationLogTable).values({
      id: randomUUID(),
      channel: "portal",
      template: "meal_nudge_dismissed",
      recipient: "browser",
      subject: `Meal alert dismissed: ${mealType}`,
      body: `A browser dismissed the ${mealType} meal alert for ${date}.`,
      status: "skipped",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Meal alert dismissal logging failed", error);
    return NextResponse.json({ error: "Could not record the dismissal." }, { status: 500 });
  }
}
