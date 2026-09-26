// Single place that decides which public domain goes into emails
// (guest track links, manager portal links). Reads the live tunnel URL from
// PUBLIC_APP_URL (preferred, not NEXT_PUBLIC_ so secrets stay server-side),
// falls back to NEXT_PUBLIC_APP_URL, and never returns localhost on Vercel.
export function publicBaseUrl(request?: Request) {
  const fromEnv =
    process.env.PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "";
  if (fromEnv && !/localhost|127\.0\.0\.1/i.test(fromEnv)) return fromEnv.replace(/\/$/, "");
  if (fromEnv) return fromEnv.replace(/\/$/, ""); // local dev: localhost is correct there
  if (request) {
    try {
      const u = new URL(request.url);
      if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
        return `${u.protocol}//${u.host}`;
      }
    } catch {
      // ignore — fall through
    }
  }
  return "";
}

export type MailAttachment = { filename: string; content: Buffer; contentType: string };

export async function sendMail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
}) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return {
      sent: false as const,
      reason:
        "SMTP is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM). The PDF invoice remains downloadable and shareable on WhatsApp.",
    };
  }
  const mod = (await import("nodemailer")) as unknown as {
    default?: { createTransport: (...args: unknown[]) => { sendMail: (msg: unknown) => Promise<unknown> } };
    createTransport: (...args: unknown[]) => { sendMail: (msg: unknown) => Promise<unknown> };
  };
  const nodemailer = mod.default ?? mod;
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });
  const from =
    process.env.SMTP_FROM ||
    (process.env.FROM_NAME && process.env.FROM_EMAIL
      ? `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`
      : `Sunrise Motel <${user}>`);
  await transporter.sendMail({
    from,
    to: Array.isArray(opts.to) ? opts.to.join(", ") : opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: opts.attachments,
  });
  return { sent: true as const };
}

export async function sendInvoiceEmail(to: string, subject: string, html: string, pdf: Uint8Array, filename: string) {
  return sendMail({ to, subject, html, attachments: [{ filename, content: Buffer.from(pdf), contentType: "application/pdf" }] });
}

export function guestEmailHtml(opts: {
  guestName: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  reference: string;
  invoiceNumber: string;
  total: number;
  paid: number;
  trackUrl: string;
  extras: string[];
}) {
  const balance = Math.max(0, opts.total - opts.paid);
  const base = publicBaseUrl();
  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px 8px;color:#756c64;border-bottom:1px solid #f1ebe2">${k}</td><td style="padding:6px 8px;font-weight:bold;border-bottom:1px solid #f1ebe2">${v}</td></tr>`;
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#171513">
    <div style="background:#171513;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
      <div style="font-size:11px;letter-spacing:3px;color:#f28c18;font-weight:bold">SUNRISE MOTEL · AREA 5, LILONGWE</div>
      <h1 style="margin:6px 0 0;font-family:Georgia,serif;font-weight:400">Zikomo, ${opts.guestName} — your request is in.</h1>
      <p style="margin:8px 0 0;color:#e9d8c4;font-size:13px">We are holding <strong>${opts.roomType}</strong> while the front desk confirms. Keep reference <strong>${opts.reference}</strong>.</p>
    </div>
    <div style="border:1px solid #e9d8c4;border-top:0;padding:20px 24px;border-radius:0 0 10px 10px">
      <h2 style="font-size:14px;margin:0 0 10px">Your stay at a glance</h2>
      <table style="width:100%;font-size:13px;border-collapse:collapse">
        ${row("Booking reference", opts.reference)}
        ${row("Invoice", opts.invoiceNumber)}
        ${row("Room", opts.roomType)}
        ${row("Dates", `${opts.checkIn} to ${opts.checkOut} (${opts.nights} night${opts.nights > 1 ? "s" : ""})`)}
        ${row("Guests", `${opts.adults} adult${opts.adults > 1 ? "s" : ""}${opts.children ? ` + ${opts.children} child${opts.children > 1 ? "ren" : ""}` : ""}`)}
        ${opts.extras.length ? row("Extras", opts.extras.join(", ")) : ""}
        ${row("Total", `MWK ${opts.total.toLocaleString()}`)}
        ${row("Paid", `MWK ${opts.paid.toLocaleString()}`)}
        ${row("Balance due", `MWK ${balance.toLocaleString()}`)}
      </table>
      <p style="font-size:13px">Your <strong>pro-forma ${opts.invoiceNumber}</strong> is attached as a PDF. Pay by National Bank transfer (Acc 1009876543), Airtel Money <strong>+265 998 688 332</strong> or TNM Mpamba <strong>+265 888 123 456</strong>, then send proof on WhatsApp quoting <strong>${opts.reference}</strong>.</p>
      <p><a href="${base}${opts.trackUrl}" style="display:inline-block;background:#f28c18;color:#171513;font-weight:bold;text-decoration:none;padding:10px 18px;border-radius:6px">Track this booking</a></p>
      <p style="font-size:12px;color:#756c64">Front desk: +265 998 688 332 · Area 5, Lilongwe · <em>When you are here, you are family.</em></p>
    </div>
  </div>`;
}

// Sent when an admin creates a portal login (or resets one) and asks for the
// details to be emailed. Keeps the same dark/orange letterhead as guest mail so
// the team recognises it instantly and does not file it as spam.
export function staffCredentialsHtml(opts: {
  name: string;
  email: string;
  password: string;
  staffCode: string;
  role: "admin" | "staff";
  loginUrl?: string;
  portalUrl?: string;
  createdBy?: string | null;
  reset?: boolean;
}) {
  const base = (opts.portalUrl ?? publicBaseUrl()).replace(/\/$/, "");
  const loginUrl = opts.loginUrl ?? `${base}/admin`;
  const row = (k: string, v: string) =>
    `<tr><td style="padding:8px 10px;color:#756c64;border-bottom:1px solid #f1ebe2">${k}</td><td style="padding:8px 10px;font-weight:bold;border-bottom:1px solid #f1ebe2;font-family:'Courier New',monospace">${v}</td></tr>`;
  const roleLabel = opts.role === "admin" ? "Admin (full control)" : "Staff (bookings only)";
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#171513">
    <div style="background:#171513;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
      <div style="font-size:11px;letter-spacing:3px;color:#f28c18;font-weight:bold">SUNRISE MOTEL · MANAGER PORTAL</div>
      <h1 style="margin:6px 0 0;font-family:Georgia,serif;font-weight:400">Moni ${opts.name}, here is your ${opts.reset ? "new " : ""}login.</h1>
      <p style="margin:8px 0 0;color:#e9d8c4;font-size:13px">Use the details below to open the manager portal. Keep them private — anyone with them can see bookings and guest details.</p>
    </div>
    <div style="border:1px solid #e9d8c4;border-top:0;padding:20px 24px;border-radius:0 0 10px 10px">
      <h2 style="font-size:14px;margin:0 0 10px">Your account</h2>
      <table style="width:100%;font-size:13px;border-collapse:collapse">
        ${row("Email (login)", opts.email)}
        ${row("Password", opts.password)}
        ${row("Your staff ID", opts.staffCode)}
        ${row("Access level", roleLabel)}
      </table>
      <p style="font-size:13px"><a href="${loginUrl}" style="display:inline-block;background:#f28c18;color:#171513;font-weight:bold;text-decoration:none;padding:10px 18px;border-radius:6px;margin-top:14px">Open the manager portal</a></p>
      <p style="font-size:12px;color:#756c64">Sign in at <strong>${loginUrl}</strong> with the email and password above.${opts.createdBy ? ` This account was set up by ${opts.createdBy}.` : ""}</p>
      <p style="font-size:12px;color:#756c64">Every action you take in the portal is recorded against your staff ID (${opts.staffCode}), so please do not share this password. Ask an admin to reset it if you think someone else has seen it.</p>
      <p style="font-size:12px;color:#756c64">Front desk: +265 998 688 332 · Area 5, Lilongwe · <em>When you are here, you are family.</em></p>
    </div>
  </div>`;
}

export function adminAlertHtml(opts: {
  guestName: string;
  phone: string;
  email: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  reference: string;
  bookingNumber?: string | null;
  invoiceNumber: string;
  total: number;
  arrival: string | null;
  requests: string | null;
  extras: string[];
}) {
  const base = publicBaseUrl();
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;color:#171513">
    <h2 style="margin:0 0 6px">New booking to review — ${opts.bookingNumber ?? opts.reference}</h2>
    <p style="margin:0 0 12px;color:#555"><strong>${opts.guestName}</strong> (${opts.phone}${opts.email ? ` · ${opts.email}` : ""}) requested <strong>${opts.roomType}</strong>, ${opts.checkIn} to ${opts.checkOut} (${opts.nights} night${opts.nights > 1 ? "s" : ""}), ${opts.adults} adult${opts.adults > 1 ? "s" : ""}${opts.children ? ` + ${opts.children} child${opts.children > 1 ? "ren" : ""}` : ""}.</p>
    <p style="font-size:13px">Invoice <strong>${opts.invoiceNumber}</strong> · Total <strong>MWK ${opts.total.toLocaleString()}</strong>${opts.extras.length ? ` · Extras: ${opts.extras.join(", ")}` : ""}${opts.arrival ? ` · Arrival: ${opts.arrival}` : ""}${opts.requests ? ` · Notes: ${opts.requests}` : ""}</p>
    <p style="font-size:13px">Open the <a href="${base}/admin">manager portal</a> to confirm, assign a room and email the guest.</p>
  </div>`;
}
