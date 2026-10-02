import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { mealNotificationSettingsTable } from "@/db/schema";
import { clientIp, logAudit } from "@/lib/audit";
import { isSuperAdminRole, readSession, sessionLabel } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

type SettingInput = {
  mealType: string;
  enabled: boolean;
  title: string;
  message: string;
  startTime: string;
  endTime: string;
  popupDurationMinutes: number;
  ctaText: string;
  imageUrl: string | null;
};

function parseInput(body: Record<string, unknown>): SettingInput | string {
  const mealType = typeof body.mealType === "string" ? body.mealType.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const startTime = typeof body.startTime === "string" ? body.startTime.trim() : "";
  const endTime = typeof body.endTime === "string" ? body.endTime.trim() : "";
  const ctaText = typeof body.ctaText === "string" ? body.ctaText.trim() : "View Live Menu";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const duration = body.popupDurationMinutes;
  const enabled = body.enabled;

  if (!["breakfast", "lunch", "dinner", "late_night_preorder", "custom"].includes(mealType)) {
    return "Choose a valid meal alert type.";
  }
  if (!title || title.length > 160 || !message || message.length > 2000) return "Title and message are required.";
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
    return "Start and end times must be valid 24-hour times.";
  }
  if (startTime === endTime) return "Start and end times must be different.";
  if (!Number.isInteger(duration) || Number(duration) < 1 || Number(duration) > 1440) {
    return "Popup duration must be between 1 and 1,440 minutes.";
  }
  if (enabled !== undefined && typeof enabled !== "boolean") return "Enabled must be true or false.";
  if (!ctaText || ctaText.length > 80) return "Button text is required and must be 80 characters or fewer.";
  if (imageUrl && imageUrl.length > 2048) return "Promo image URL is too long.";
  if (imageUrl && !imageUrl.startsWith("/") && !/^https?:\/\/[^/]+/i.test(imageUrl)) {
    return "Promo image must be a site path or HTTP/HTTPS URL.";
  }

  return {
    mealType,
    enabled: enabled === undefined ? true : enabled,
    title,
    message,
    startTime,
    endTime,
    popupDurationMinutes: Number(duration),
    ctaText,
    imageUrl: imageUrl || null,
  };
}

async function authorize(request: Request) {
  const user = await readSession(request);
  if (!user) return { response: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  if (!isSuperAdminRole(user.role)) {
    return { response: NextResponse.json({ error: "Administrator access required." }, { status: 403 }) };
  }
  return { user };
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  try {
    const settings = await db.select().from(mealNotificationSettingsTable).orderBy(asc(mealNotificationSettingsTable.startTime));
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Meal notification settings load failed", error);
    return NextResponse.json({ error: "Could not load meal alert settings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = parseInput({ ...body, mealType: "custom" });
    if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });
    const [setting] = await db.insert(mealNotificationSettingsTable).values({
      id: randomUUID(),
      ...parsed,
      mealType: "custom",
    }).returning();
    await logAudit({
      action: "meal_alert.created",
      entity: "meal_notification",
      entityId: setting.id,
      summary: `${sessionLabel(auth.user)} created the custom meal alert "${setting.title}".`,
      actor: "manager",
      actorLabel: sessionLabel(auth.user),
      ip: clientIp(request),
      metadata: { mealType: setting.mealType, startTime: setting.startTime, endTime: setting.endTime },
    });
    return NextResponse.json({ setting }, { status: 201 });
  } catch (error) {
    console.error("Custom meal alert create failed", error);
    return NextResponse.json({ error: "Could not create the meal alert." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "A meal alert ID is required." }, { status: 400 });
    if (Object.keys(body).every((key) => key === "id" || key === "enabled") && typeof body.enabled === "boolean") {
      const [setting] = await db.update(mealNotificationSettingsTable)
        .set({ enabled: body.enabled, updatedAt: new Date() })
        .where(eq(mealNotificationSettingsTable.id, id))
        .returning();
      if (!setting) return NextResponse.json({ error: "Meal alert not found." }, { status: 404 });
      return NextResponse.json({ setting });
    }

    const parsed = parseInput(body);
    if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });
    const [setting] = await db.update(mealNotificationSettingsTable)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(mealNotificationSettingsTable.id, id))
      .returning();
    if (!setting) return NextResponse.json({ error: "Meal alert not found." }, { status: 404 });
    await logAudit({
      action: "meal_alert.updated",
      entity: "meal_notification",
      entityId: setting.id,
      summary: `${sessionLabel(auth.user)} updated the meal alert "${setting.title}".`,
      actor: "manager",
      actorLabel: sessionLabel(auth.user),
      ip: clientIp(request),
      metadata: { mealType: setting.mealType, enabled: setting.enabled, startTime: setting.startTime, endTime: setting.endTime },
    });
    return NextResponse.json({ setting });
  } catch (error) {
    console.error("Meal alert update failed", error);
    return NextResponse.json({ error: "Could not update the meal alert." }, { status: 500 });
  }
}
