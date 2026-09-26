import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { bookingEventsTable } from "@/db/schema";

export async function logBookingEvent(
  bookingId: string,
  reference: string,
  action: string,
  note?: string | null,
  actor: "guest" | "manager" | "system" = "system",
) {
  try {
    await db.insert(bookingEventsTable).values({
      id: randomUUID(),
      bookingId,
      reference,
      action,
      note: note ?? null,
      actor,
    });
  } catch (error) {
    console.error("Failed to log booking event", error);
  }
}
