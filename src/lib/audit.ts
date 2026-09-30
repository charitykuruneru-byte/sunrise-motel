// Append-only audit trail. Every row carries actor + IP + UTC instant (timestamptz)
// so records stay accurate and organised for future auditing.
// Tables covered: bookings, invoices, gallery_images, posts (+ uploads, auth).

import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { auditLogTable, staffTable } from "@/db/schema";
import { eq } from "drizzle-orm";

export type AuditActor = "guest" | "manager" | "system";

export async function logAudit(opts: {
  action: string;
  entity: string;
  entityId?: string | null;
  reference?: string | null;
  summary?: string | null;
  actor?: AuditActor;
  actorLabel?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  targetId?: string | null;
  targetEmail?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
}) {
  try {
    let actorId = opts.actorId ?? null;
    let actorEmail = opts.actorEmail ?? null;
    let actorRole = opts.actorRole ?? null;
    if (!actorId && opts.actor === "manager" && opts.actorLabel) {
      const parts = opts.actorLabel.split(" — ");
      const staffCode = /^(?:STF|ADM)\d+$/i.test(parts[0] ?? "") ? parts[0] : null;
      const staffName = staffCode ? null : parts.at(-1)?.trim();
      const matches = staffCode
        ? await db.select().from(staffTable).where(eq(staffTable.staffCode, staffCode)).limit(1)
        : staffName
          ? await db.select().from(staffTable).where(eq(staffTable.name, staffName)).limit(2)
          : [];
      if (matches.length === 1) {
        actorId = matches[0].id;
        actorEmail = actorEmail ?? matches[0].email;
        actorRole = actorRole ?? matches[0].role;
      }
    }
    await db.insert(auditLogTable).values({
      id: randomUUID(),
      action: opts.action,
      entity: opts.entity,
      entityId: opts.entityId ?? null,
      reference: opts.reference ?? null,
      summary: opts.summary ?? null,
      actor: opts.actor ?? "system",
      actorLabel: opts.actorLabel ?? null,
      actorId,
      actorEmail,
      actorRole,
      targetId: opts.targetId ?? opts.entityId ?? null,
      targetEmail: opts.targetEmail ?? null,
      ip: opts.ip ?? null,
      metadataJson: opts.metadata ? JSON.stringify(opts.metadata) : null,
      details: opts.details ?? null,
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
