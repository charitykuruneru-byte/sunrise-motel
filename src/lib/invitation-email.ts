import { sendMail } from "@/lib/mail";

const GUEST_APK = "https://github.com/charitykuruneru-byte/sunrise-motel/releases/latest/download/SunriseMotel.apk";
const MANAGER_APK = "https://github.com/charitykuruneru-byte/sunrise-motel/releases/latest/download/SunriseManager.apk";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function appOrigin(request: Request) {
  const configured = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  const origin = new URL(configured || request.url);
  if (process.env.NODE_ENV === "production" && origin.protocol !== "https:") {
    throw new Error("PUBLIC_APP_URL must use HTTPS in production.");
  }
  return origin.origin;
}

export async function sendInvitationEmail(opts: {
  request: Request;
  email: string;
  name: string;
  role: string;
  accountType: "staff" | "guest";
  invitedByName: string;
  invitedByEmail: string;
  token: string;
  booking?: { reference: string; roomType: string; checkIn: string } | null;
}) {
  const base = appOrigin(opts.request);
  const setupUrl = `${base}/setup-account?token=${encodeURIComponent(opts.token)}`;
  const name = escapeHtml(opts.name);
  const role = escapeHtml(opts.role.replaceAll("_", " "));
  const inviterName = escapeHtml(opts.invitedByName);
  const inviterEmail = escapeHtml(opts.invitedByEmail);
  const guest = opts.accountType === "guest";
  const subject = guest
    ? "Welcome to Sunrise Motel - Create Your Account & Download Our App"
    : "You have been invited to Sunrise Motel Management System";
  const bookingText = opts.booking
    ? `<p><strong>Your booking</strong><br>Booking ID: ${escapeHtml(opts.booking.reference)}<br>Room: ${escapeHtml(opts.booking.roomType)}<br>Check-in: ${escapeHtml(opts.booking.checkIn)}</p>`
    : "";
  const actionLabel = guest ? "Create My Guest Account" : "Set Up My Account";
  const androidLink = guest ? GUEST_APK : MANAGER_APK;
  const download = guest
    ? `<p><a href="${androidLink}">Download the Sunrise Motel Android app</a> · <a href="${base}/download#guest-app">All app options</a></p>`
    : `<p><a href="${androidLink}">Download Sunrise Manager for Android</a></p>`;
  const loginUrl = guest ? `${base}/app` : `${base}/admin/login`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#171513;border:1px solid #eadfce;border-radius:12px;overflow:hidden">
      <div style="background:#171513;padding:24px;text-align:center"><img src="${base}/images/sunrise-logo.svg" alt="Sunrise Motel" width="56" height="56"><p style="margin:10px 0 0;color:#f28c18;font-size:11px;font-weight:bold;letter-spacing:2px">SUNRISE MOTEL &amp; RESTAURANT</p></div>
      <div style="padding:28px 30px">
        <p>Hello ${name},</p>
        ${guest
          ? `<p>Thank you for staying with us at Sunrise Motel. Set up your guest account to view your bookings, receipts and stay details.</p>${bookingText}`
          : `<p>You have been invited as <strong>${role}</strong> to the Sunrise Motel Management System by ${inviterName} (${inviterEmail}).`}
        <p style="margin:26px 0"><a href="${setupUrl}" style="display:inline-block;background:#f28c18;color:#171513;font-weight:bold;text-decoration:none;padding:13px 20px;border-radius:6px">${actionLabel}</a></p>
        <p>This secure link expires in 24 hours and can only be used once.</p>
        ${download}
        <p>After setup, sign in at <a href="${loginUrl}">${loginUrl}</a>.</p>
        <p style="font-size:13px;color:#756c64">If you did not expect this invitation, please ignore this email.</p>
        <p>Regards,<br>Sunrise Motel Team</p>
      </div>
    </div>`;
  const text = guest
    ? `Hello ${opts.name},\n\nThank you for staying with us at Sunrise Motel. Create your guest account: ${setupUrl}\n\nDownload the Android app: ${GUEST_APK}\nAll app options: ${base}/download#guest-app\n${opts.booking ? `Booking: ${opts.booking.reference}; room: ${opts.booking.roomType}; check-in: ${opts.booking.checkIn}\n` : ""}\nThis link expires in 24 hours and can only be used once.`
    : `Hello ${opts.name},\n\nYou have been invited as ${opts.role} by ${opts.invitedByName} (${opts.invitedByEmail}).\nSet up your account within 24 hours: ${setupUrl}\n\nLogin: ${loginUrl}\nManager app: ${MANAGER_APK}\n\nIf you did not expect this invitation, please ignore this email.`;

  return sendMail({ to: opts.email, subject, html, text });
}