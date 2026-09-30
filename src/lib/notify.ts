// Every message the system attempts lands in `notification_log` with its outcome
// (Part 7 of the v2 spec). Email goes out through the existing SMTP helper; SMS,
// WhatsApp and push providers are not configured on this deployment, so those
// channels are logged honestly as `skipped` with the reason — never faked.

import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { notificationLogTable } from "@/db/schema";
import { sendMail } from "@/lib/mail";

export type NotifyChannel = "email" | "sms" | "push" | "whatsapp" | "portal";

export async function logNotification(input: {
  channel: NotifyChannel;
  template: string;
  recipient?: string | null;
  subject?: string | null;
  body?: string | null;
  status: "queued" | "sent" | "failed" | "skipped";
  providerRef?: string | null;
  error?: string | null;
  guestId?: string | null;
  bookingId?: string | null;
}) {
  try {
    await db.insert(notificationLogTable).values({
      id: randomUUID(),
      channel: input.channel,
      template: input.template,
      recipient: input.recipient ?? null,
      subject: input.subject ?? null,
      body: input.body ?? null,
      status: input.status,
      providerRef: input.providerRef ?? null,
      error: input.error ?? null,
      guestId: input.guestId ?? null,
      bookingId: input.bookingId ?? null,
    });
  } catch (error) {
    console.error("Failed to write notification log", error);
  }
}

/** Send an email and record the attempt either way. */
export async function notifyByEmail(input: {
  to: string | null | undefined;
  subject: string;
  html: string;
  text?: string;
  template: string;
  guestId?: string | null;
  bookingId?: string | null;
  /**
   * What to write into `notification_log` instead of the body. Used for one-time
   * codes: the code travels in the email, but the log must never contain it.
   */
  logBody?: string | null;
}) {
  if (!input.to) {
    await logNotification({
      channel: "email",
      template: input.template,
      subject: input.subject,
      status: "skipped",
      error: "No email address on record.",
      guestId: input.guestId,
      bookingId: input.bookingId,
    });
    return { sent: false as const, reason: "No email address on record." };
  }
  try {
    const result = await sendMail({
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    await logNotification({
      channel: "email",
      template: input.template,
      recipient: input.to,
      subject: input.subject,
      body: input.logBody ?? input.text ?? null,
      status: result.sent ? "sent" : "skipped",
      // The provider's own id when it gave us one — the receipt to quote if the
      // message never arrives. For SMTP the server's acceptance line is appended,
      // e.g. "… · 250 2.0.0 OK … - gsmtp": proof the receiving server took it.
      providerRef: result.sent
        ? [result.messageId, "smtpResponse" in result ? result.smtpResponse : null].filter(Boolean).join(" · ").slice(0, 160) || null
        : null,
      error: result.sent ? null : result.reason,
      guestId: input.guestId,
      bookingId: input.bookingId,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error";
    await logNotification({
      channel: "email",
      template: input.template,
      recipient: input.to,
      subject: input.subject,
      status: "failed",
      error: message,
      guestId: input.guestId,
      bookingId: input.bookingId,
    });
    return { sent: false as const, reason: message };
  }
}

/** Record a service notification that is delivered inside the portal. */
export async function notifyInPortal(input: {
  template: string;
  recipient?: string;
  subject: string;
  body?: string;
  guestId?: string | null;
  bookingId?: string | null;
}) {
  await logNotification({
    channel: "portal",
    template: input.template,
    recipient: input.recipient ?? "front desk",
    subject: input.subject,
    body: input.body ?? null,
    status: "sent",
    guestId: input.guestId,
    bookingId: input.bookingId,
  });
}

/**
 * SMS / WhatsApp hook. There is no gateway configured, so the message is logged
 * as skipped WITH the body — the desk can read the wording out or copy it into
 * WhatsApp, which is the honest non-app fallback the spec requires.
 */
export async function notifyBySms(input: {
  to: string | null | undefined;
  subject: string;
  body: string;
  template: string;
  channel?: "sms" | "whatsapp";
  guestId?: string | null;
  bookingId?: string | null;
}) {
  const channel = input.channel ?? "sms";
  await logNotification({
    channel,
    template: input.template,
    recipient: input.to ?? null,
    subject: input.subject,
    body: input.body,
    status: input.to ? "skipped" : "skipped",
    error: input.to
      ? `${channel.toUpperCase()} gateway not configured — send this wording by WhatsApp or from the desk.`
      : "No phone number on record.",
    guestId: input.guestId,
    bookingId: input.bookingId,
  });
}
