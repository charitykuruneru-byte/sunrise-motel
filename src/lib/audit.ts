// Append-only audit trail. Every row carries actor + IP + UTC instant (timestamptz)
// so records stay accurate and organised for future auditing.
// Tables covered: bookings, invoices, gallery_images, posts (+ uploads, auth).

import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { auditLogTable } from "@/db/schema";

export type AuditActor = "guest" | "manager" | "system";

export async function logAudit(opts: {
  action: string;
  entity: string;
  entityId?: string | null;
  reference?: string | null;
  summary?: string | null;
  actor?: AuditActor;
  actorLabel?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  try {
    await db.insert(auditLogTable).values({
      id: randomUUID(),
      action: opts.action,
      entity: opts.entity,
      entityId: opts.entityId ?? null,
      reference: opts.reference ?? null,
      summary: opts.summary ?? null,
      actor: opts.actor ?? "system",
      actorLabel: opts.actorLabel ?? null,
      ip: opts.ip ?? null,
      metadataJson: opts.metadata ? JSON.stringify(opts.metadata) : null,
    });
  } catch (error) {
    console.error("Failed to write audit log", error);
  }
}

/** Pull the client IP behind proxies for the audit record. */
export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip")?.trim() || null;
}
