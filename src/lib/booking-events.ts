import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { bookingEventsTable } from "@/db/schema";

export async function logBookingEvent(
  bookingId: string,
  reference: string,
  action: string,
  note?: string | null,
  actor: "guest" | "manager" | "system" = "system",
  actorInfo?: { id?: string | null; name?: string | null; email?: string | null; role?: string | null },
) {
  try {
    await db.insert(bookingEventsTable).values({
      id: randomUUID(),
      bookingId,
      reference,
      action,
      note: note ?? null,
      actor,
      actorId: actorInfo?.id ?? null,
      actorName: actorInfo?.name ?? null,
      actorEmail: actorInfo?.email ?? null,
      actorRole: actorInfo?.role ?? null,
    });
  } catch (error) {
    console.error("Failed to log booking event", error);
  }
}
