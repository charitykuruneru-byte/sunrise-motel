#!/usr/bin/env node
/**
 * Proves the mail settings in .env can actually deliver Sunrise Motel email.
 *
 *   node scripts/verify-email-smtp.mjs                          # config + real sends
 *   node scripts/verify-email-smtp.mjs --dry                    # config only, sends nothing
 *   node scripts/verify-email-smtp.mjs --to someone@gmail.com   # send the batch elsewhere
 *
 * It calls the app's OWN module (`src/lib/mail.ts`), so a pass here means the
 * booking confirmation, the invoice email and staff invitations send too.
 *
 * Gmail recipe (what .env ships with):
 *   SMTP_HOST=smtp.gmail.com   SMTP_PORT=587   SMTP_SECURE=false
 *   SMTP_USER=<the full gmail address>
 *   SMTP_PASS=<16-character App Password from Google, DISPLAY SPACES STRIPPED>
 *   SMTP_FROM="Sunrise Motel <the same gmail address>"   (Gmail rewrites it otherwise)
 * An App Password needs 2-Step Verification on the account, and SMTP AUTH
 * rejects the "abcd efgh ijkl mnop" display form — paste it as 16 characters.
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env") });

const dry = process.argv.includes("--dry");
const toIndex = process.argv.indexOf("--to");
const cliTo = toIndex > -1 ? (process.argv[toIndex + 1] ?? "").trim() : "";
const {
  RESEND_API_KEY, SMTP_HOST, SMTP_PORT, SMTP_SECURE,
  SMTP_USER, SMTP_PASS, SMTP_FROM, ADMIN_EMAIL,
} = process.env;

const pass = (SMTP_PASS ?? "").replace(/\s+/g, "");

console.log("Sunrise Motel — email verification\n");
// Plain aligned lines rather than console.table: box-drawing characters mangle
// in cmd.exe and in copied logs, and this output is meant to be pasted around.
const settings = {
  RESEND_API_KEY: RESEND_API_KEY ? "SET — it wins over SMTP, unset it to test Gmail" : "unset",
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER: SMTP_USER ?? "(unset)",
  SMTP_PASS: `(${pass.length} chars${pass.length === 16 ? ", correct app-password length" : " — a Google app password is 16"})`,
  SMTP_FROM,
  ADMIN_EMAIL,
};
for (const [key, value] of Object.entries(settings)) console.log(`  ${key.padEnd(14)} ${value ?? ""}`);
console.log("");

let failures = 0;
for (const [name, value] of [["SMTP_HOST", SMTP_HOST], ["SMTP_USER", SMTP_USER], ["SMTP_PASS", pass]]) {
  if (!value) {
    failures++;
    console.error(`MISSING ${name} — fill it in .env (this script reads the repo-root .env).`);
  }
}
if (/localhost|127\.0\.0\.1/.test(SMTP_HOST ?? "")) {
  failures++;
  console.error("SMTP_HOST must be the mail server (smtp.gmail.com), not a local address.");
}
if (failures) process.exit(1);

const { sendMail, sendInvoiceEmail, guestEmailHtml, staffCredentialsHtml } =
  await import(pathToFileURL(join(root, "src", "lib", "mail.ts")).href);

if (dry) {
  console.log(`\n--dry: configuration checks done, no email sent (${failures} problem(s)).`);
  process.exitCode = failures ? 1 : 0;
} else {
  const to = cliTo || ADMIN_EMAIL || SMTP_USER;
  console.log(`\nSending to ${to} as ${SMTP_FROM || SMTP_USER}\n`);

  await runChecks(to);

  console.log(failures === 0
    ? `\nALL CHECKS PASSED — 4 emails handed to ${SMTP_HOST} for ${to}.`
    : `\n${failures} CHECK(S) FAILED.`);
  process.exitCode = failures ? 1 : 0;
}

async function runChecks(to) {

async function attempt(label, run) {
  try {
    const outcome = await run();
    if (!outcome?.sent) throw new Error(outcome?.reason ?? "sendMail returned not-sent");
    console.log(`PASS  ${label}`);
  } catch (error) {
    failures++;
    console.error(`FAIL  ${label}`);
    console.error(`      ${error?.responseCode ?? ""} ${error?.response ?? error?.code ?? ""} ${error?.message ?? ""}`.trim());
    if (/5\.7\.8|535/.test(`${error?.response ?? ""}`)) {
      console.error("      Gmail refused the login: check the app password has no spaces and belongs to SMTP_USER (needs 2-Step Verification).");
    }
  }
}

await attempt("connect + sendMail (plain)", () =>
  sendMail({
    to,
    subject: "Sunrise Motel — email test 1/4 (plain sendMail)",
    html: "<p>Plain <code>sendMail()</code> from the app's own module works.</p>",
    text: "Plain sendMail() from the app's own module works.",
  }));

await attempt("guest template (guestEmailHtml)", () =>
  sendMail({
    to,
    subject: "Sunrise Motel — email test 2/4 (guest template)",
    html: guestEmailHtml({
      guestName: "Grace", roomType: "Standard Double", checkIn: "2026-10-10", checkOut: "2026-10-12",
      nights: 2, adults: 2, children: 0, reference: "SM-TEST-0001", invoiceNumber: "INV-TEST-0001",
      total: 180000, paid: 50000, trackUrl: "/track?ref=SM-TEST-0001", extras: ["Breakfast x2"],
    }),
    text: "Guest template test.",
  }));

try {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Sunrise Motel — attachment test", { x: 50, y: 780, size: 14, font });
  page.drawText("Invoice INV-TEST-0001 (pro-forma) — MWK 180,000", { x: 50, y: 756, size: 11, font });
  const pdf = await doc.save();
  await attempt("invoice email with PDF attachment (sendInvoiceEmail)", () =>
    sendInvoiceEmail(to, "Sunrise Motel — email test 3/4 (PDF attached)",
      "<p>Pro-forma <strong>INV-TEST-0001</strong> is attached.</p>", pdf, "SM-TEST-0001.pdf"));
} catch (error) {
  failures++;
  console.error(`FAIL  invoice email with PDF attachment — ${error?.message}`);
}

await attempt("staff credentials template (staffCredentialsHtml)", () =>
  sendMail({
    to,
    subject: "Sunrise Motel — email test 4/4 (staff credentials template)",
    html: staffCredentialsHtml({
      name: "Test Login", email: to, password: "NotAReal-Password", staffCode: "STF999",
      role: "admin", createdBy: "scripts/verify-email-smtp.mjs", reset: false,
    }),
    text: "Staff credentials template test.",
  }));

  // Gmail's own acceptance line, straight from the socket — independent of the
  // app code, and handy when someone wants proof in the mailbox, not the log.
  console.log("\nSMTP transcript (direct transport — Gmail's own response):");
  try {
    const nodemailer = (await import("nodemailer")).default;
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: SMTP_SECURE === "true",
      auth: { user: SMTP_USER, pass },
    });
    const info = await transport.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to,
      subject: "Sunrise Motel — email test 5/5 (SMTP transcript)",
      text: `Direct SMTP check. Accepted at ${new Date().toISOString()}.`,
    });
    console.log(`  accepted : ${JSON.stringify(info.accepted)}`);
    console.log(`  rejected : ${JSON.stringify(info.rejected)}`);
    console.log(`  response : ${info.response}`);
    console.log(`  messageId: ${info.messageId}`);
    transport.close();
  } catch (error) {
    failures++;
    console.error(`FAIL  SMTP transcript — ${error?.responseCode ?? ""} ${error?.response ?? error?.message}`);
  }
}