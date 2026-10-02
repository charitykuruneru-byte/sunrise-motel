import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { mealNotificationSettingsTable } from "@/db/schema";
import { MALAWI_TZ, malawiDatePart } from "@/lib/time";

export const dynamic = "force-dynamic";
export const revalidate = 10;

function currentMalawiTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MALAWI_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function activeWindow(start: number, end: number, now: number) {
  return end > start ? now >= start && now < end : now >= start || now < end;
}

export async function GET() {
  try {
    const now = new Date();
    const nowMinutes = currentMalawiTime(now);
    const date = malawiDatePart(now);
    const settings = await db.select().from(mealNotificationSettingsTable)
      .where(eq(mealNotificationSettingsTable.enabled, true))
      .orderBy(asc(mealNotificationSettingsTable.startTime));

    const today = settings.map((setting) => {
      const start = minutes(setting.startTime);
      const end = minutes(setting.endTime);
      const isActive = activeWindow(start, end, nowMinutes);
      const elapsedMinutes = nowMinutes >= start ? nowMinutes - start : nowMinutes + 1440 - start;
      const windowDuration = (end - start + 1440) % 1440;
      const popupAvailable = isActive && elapsedMinutes < Math.min(setting.popupDurationMinutes, windowDuration);
      const remainingMinutes = popupAvailable
        ? Math.min(setting.popupDurationMinutes - elapsedMinutes, windowDuration - elapsedMinutes)
        : 0;
      const status = isActive
        ? "active"
        : end > start && nowMinutes >= end
          ? "ended"
          : "upcoming";
      return {
        ...setting,
        status,
        popupAvailable,
        expiresAt: popupAvailable ? new Date(now.getTime() + remainingMinutes * 60_000).toISOString() : null,
      };
    });

    return NextResponse.json(
      { date, timezone: MALAWI_TZ, active: today.filter((setting) => setting.status === "active"), today },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=5" } },
    );
  } catch (error) {
    console.error("Active meal notifications load failed", error);
    return NextResponse.json({ error: "Meal alerts are temporarily unavailable." }, { status: 500 });
  }
}
