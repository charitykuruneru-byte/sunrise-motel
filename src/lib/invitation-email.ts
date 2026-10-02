import { publicBaseUrl, publicOriginCandidate } from "@/lib/mail";
import { notifyByEmail } from "@/lib/notify";
import { settings } from "@/lib/settings";

const GUEST_APK = "https://github.com/charitykuruneru-byte/sunrise-motel/releases/latest/download/SunriseMotel.apk";

/**
 * ONE place decides how long an invitation lives, because the database row and the
 * sentence in the email must never disagree: the previous pair said "24 hours" in
 * the email while the row expired 24 hours later, and any future edit would have
 * silently changed only one of them. Guest activation tokens are 7 days
 * (src/lib/guest-auth.ts), so the same window now covers both.
 */
export const INVITEE_TTL_DAYS = 7;
export const INVITEE_TTL_HOURS = INVITEE_TTL_DAYS * 24;

/** "admin" → "Administrator", "super_admin" → "Super Admin" — the same words the portal shows. */
export function roleLabel(role: string) {
  if (role === "admin") return "Administrator";
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

/**
 * The origin an invitation is built on.
 *
 * Deliberately reads the setting through src/lib/settings.ts instead of
 * `process.env` directly, so the host can be corrected with one row in
 * `app_settings` — the escape hatch this deployment already leans on for SMTP and
 * the push keys, because its hosting environment variables cannot be edited. With
 * `SETTINGS_SOURCE=db` present the stored value wins over a stale env one, which
 * is what a wrong invitation host needs.
 *
 * Whatever the setting cannot supply falls back to the same resolution every other
 * email link uses (src/lib/mail.ts): Vercel's own production host, then the
 * request's host. An unusable value is skipped rather than thrown, so a bad
 * setting can make a link's host wrong but can never stop the email being sent —
 * the version this replaces threw on a non-HTTPS setting and lost the invitation
 * entirely.
 */
export async function appOrigin(request: Request) {
  const configured = await settings("PUBLIC_APP_URL", "NEXT_PUBLIC_APP_URL");
  return (
    publicOriginCandidate(configured.PUBLIC_APP_URL) ??
    publicOriginCandidate(configured.NEXT_PUBLIC_APP_URL) ??
    publicBaseUrl(request)
  );
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
  const base = await appOrigin(opts.request);
  const setupUrl = `${base}/setup-account?token=${encodeURIComponent(opts.token)}`;
  const name = escapeHtml(opts.name);
  const role = escapeHtml(roleLabel(opts.role));
  const inviterName = escapeHtml(opts.invitedByName);
  const inviterEmail = escapeHtml(opts.invitedByEmail);
  const guest = opts.accountType === "guest";
  const subject = guest
    ? "Welcome to Sunrise Motel - Create Your Account & Download Our App"
    : `Sunrise Motel - You have been invited as ${roleLabel(opts.role)} - Set up your account`;
  const bookingText = opts.booking
    ? `<p><strong>Your booking</strong><br>Booking ID: ${escapeHtml(opts.booking.reference)}<br>Room: ${escapeHtml(opts.booking.roomType)}<br>Check-in: ${escapeHtml(opts.booking.checkIn)}</p>`
    : "";
  const actionLabel = guest ? "Create My Guest Account" : "Set Up My Account";
  const download = guest
    ? `<p><a href="${GUEST_APK}">Download the Sunrise Motel Android app</a> · <a href="${base}/download#guest-app">All app options</a></p>`
    : `<p><a href="${base}/admin">Open Sunrise Manager</a> · <a href="${base}/download#manager-app">Install on this device</a></p><p>On Android, open the Manager portal in Chrome, tap the menu, then choose Install app or Add to Home screen. Use your staff login.</p>`;
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
        <p>This secure link expires in ${INVITEE_TTL_DAYS} days and can only be used once.</p>
        ${download}
        <p>After setup, sign in at <a href="${loginUrl}">${loginUrl}</a>.</p>
        <p style="font-size:13px;color:#756c64">If you did not expect this invitation, please ignore this email.</p>
        <p>Regards,<br>Sunrise Motel Team</p>
      </div>
    </div>`;
  const text = guest
    ? `Hello ${opts.name},\n\nThank you for staying with us at Sunrise Motel. Create your guest account: ${setupUrl}\n\nDownload the Android app: ${GUEST_APK}\nAll app options: ${base}/download#guest-app\n${opts.booking ? `Booking: ${opts.booking.reference}; room: ${opts.booking.roomType}; check-in: ${opts.booking.checkIn}\n` : ""}\nThis link expires in ${INVITEE_TTL_DAYS} days and can only be used once.`
    : `Hello ${opts.name},\n\nYou have been invited as ${opts.role} by ${opts.invitedByName} (${opts.invitedByEmail}).\nSet up your account within ${INVITEE_TTL_DAYS} days: ${setupUrl}\n\nLogin: ${loginUrl}\nOpen Sunrise Manager: ${base}/admin\nInstall on Android: open the Manager portal in Chrome, tap the menu, then choose Install app or Add to Home screen.\n\nIf you did not expect this invitation, please ignore this email.`;

  // Every attempt lands in `notification_log` (recipient, subject, sent/skipped,
  // provider reference) — an invitation that never arrives must be visible in the
  // database, not only in an SMTP server's log somewhere else.
  return notifyByEmail({
    to: opts.email,
    subject,
    html,
    text,
    template: guest ? "guest_invitation" : "staff_invitation",
    logBody: guest ? "Guest account invitation (setup link not logged)." : "Staff invitation (setup link not logged).",
  });
}