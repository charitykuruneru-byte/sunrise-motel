"use client";

// THE GUEST CREDENTIALS CARD — the printed counterpart of room-card.tsx, and the
// one thing that makes the account path work from the counter.
//
// The guest path has exactly one secret: the password the system chose when the
// desk registered the account. It is shown ONCE, right here, and cannot be read
// back afterwards — so the card the guest leaves the counter with IS the
// credential, in the same way the key sleeve carries the room PIN.
//
// Two deliberate rules:
//
//   * we never email the password. It travels from the desk's screen to the
//     guest's hand, or through the desk's OWN WhatsApp message — which the desk
//     can read in full before sending, and which no mail log of ours ever sees;
//   * the sheet tells the guest to change it in Settings, so the system-set
//     password is a starting point rather than a permanent shared secret.

import { Printer, Send } from "lucide-react";
import { BTN, BTN_PRIMARY, CARD } from "./shared";

export type GuestCredentials = {
  guestName: string;
  loginEmail: string;
  /** Shown once and never again — null when the guest already had an account. */
  password: string | null;
  roomNumber?: string | null;
  checkOut?: string | null;
  guestPhone?: string | null;
  appUrl?: string | null;
  hotelName?: string;
  /** Did we also email the sign-in address? The password never travels by email. */
  emailSent?: boolean;
  emailReason?: string | null;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : "&#39;",
  );
}

/** The app link, from wherever the desk's browser is pointed. */
function appLink(card: GuestCredentials) {
  if (card.appUrl) return card.appUrl;
  return typeof window === "undefined" ? "/app" : `${window.location.origin}/app`;
}

/** Malawi numbers are written with a leading 0 locally and 265 internationally. */
function waNumber(phone?: string | null) {
  const digits = (phone ?? "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  return digits.startsWith("265") ? digits : `265${digits.replace(/^0/, "")}`;
}

/** The message the desk sends from its own WhatsApp — nothing here is sent by us. */
export function guestCredentialsMessage(card: GuestCredentials) {
  return (
    `SUNRISE MOTEL — your guest app sign-in\n` +
    `${card.guestName}${card.roomNumber ? ` · Room ${card.roomNumber}` : ""}\n` +
    `Email: ${card.loginEmail}\n` +
    (card.password ? `Password: ${card.password}\n` : "") +
    `\nOpen ${appLink(card)} and sign in. You can change the password in Settings.\n` +
    (card.checkOut ? `This works until you check out on ${card.checkOut}.` : "")
  );
}

export function guestCredentialsWhatsApp(card: GuestCredentials) {
  return `https://wa.me/${waNumber(card.guestPhone)}?text=${encodeURIComponent(guestCredentialsMessage(card))}`;
}

/**
 * The sheet the desk prints and puts in the guest's welcome pack. Plain HTML in a
 * new window, like the room card: it needs nothing installed on the desk machine.
 */
export function printGuestCredentials(card: GuestCredentials) {
  const hotel = card.hotelName ?? "SUNRISE MOTEL";
  const link = appLink(card);
  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Guest app sign-in — ${escapeHtml(card.guestName)}</title>
<style>
  @page { margin: 12mm; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #171513; }
  .card { border: 2px solid #171513; border-radius: 10px; padding: 16px 18px; max-width: 420px; }
  .hotel { font-size: 11px; letter-spacing: 0.22em; font-weight: 700; color: #c95612; }
  .who { font-size: 22px; font-weight: 800; margin-top: 4px; }
  .room { font-size: 13px; }
  .label { font-size: 10px; letter-spacing: 0.16em; font-weight: 700; color: #6b6560; margin-top: 14px; }
  .email { font-size: 15px; font-weight: 700; word-break: break-all; }
  .pw { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 26px; font-weight: 700; letter-spacing: 0.12em; }
  ol { margin: 10px 0 0 16px; padding: 0; font-size: 11px; line-height: 1.5; }
  .foot { margin-top: 12px; font-size: 10px; color: #6b6560; }
</style></head>
<body>
  <div class="card">
    <div class="hotel">${escapeHtml(hotel)} · GUEST APP SIGN-IN</div>
    <div class="who">${escapeHtml(card.guestName)}</div>
    ${card.roomNumber ? `<div class="room">Room ${escapeHtml(card.roomNumber)}</div>` : ""}
    <div class="label">SIGN IN WITH THIS EMAIL</div>
    <div class="email">${escapeHtml(card.loginEmail)}</div>
    <div class="label">${card.password ? "AND THIS PASSWORD" : "AND THE PASSWORD YOU ALREADY USE"}</div>
    <div class="pw">${card.password ? escapeHtml(card.password) : "••••••••"}</div>
    <ol>
      <li>Open <strong>${escapeHtml(link)}</strong> on your phone — or add the app to your home screen from there.</li>
      <li>Type the email and the password above. That is all: no code, no waiting for an email.</li>
      <li>Change the password to something of your own in <strong>Settings</strong> whenever you like.</li>
    </ol>
    <div class="foot">
      Lost the password? Anyone at the front desk sets a new one with you in a minute.${
        card.checkOut ? ` This account stays with you after ${escapeHtml(card.checkOut)}.` : ""
      }
    </div>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body></html>`;

  const win = window.open("", "_blank", "width=520,height=700");
  if (!win) return false; // Pop-up blocked: the on-screen card is the fallback.
  win.document.write(html);
  win.document.close();
  return true;
}

/** The same card on screen, with the password the desk has to hand over. */
export default function GuestCredentialsPanel({ credentials }: { credentials: GuestCredentials }) {
  const card = credentials;
  const copy = (value: string) => void navigator.clipboard?.writeText(value);
  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-[#f8c66b]">
          Guest app sign-in · {card.guestName}
          {card.roomNumber ? ` · Room ${card.roomNumber}` : ""}
        </p>
        <span className="flex flex-wrap gap-2">
          <button className={BTN_PRIMARY} type="button" onClick={() => printGuestCredentials(card)}>
            <Printer size={14} /> Print the sign-in card
          </button>
          <a className={BTN} href={guestCredentialsWhatsApp(card)} target="_blank" rel="noreferrer">
            <Send size={14} /> Send on WhatsApp
          </a>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-6">
        <div className="min-w-[14rem]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">Sign-in email</p>
          <p className="text-sm font-bold text-white">
            {card.loginEmail}{" "}
            <button className="underline" type="button" onClick={() => copy(card.loginEmail)}>
              copy
            </button>
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">
            {card.password ? "System-set password — read it out" : "Password — unchanged"}
          </p>
          {card.password ? (
            <p className="font-mono text-2xl font-black tracking-[0.15em] text-white">
              {card.password}{" "}
              <button className="text-xs underline" type="button" onClick={() => copy(card.password ?? "")}>
                copy
              </button>
            </p>
          ) : (
            <p className="max-w-md text-[11px] text-white/60">
              This guest already had an account, so nothing was changed: their stay is linked and they sign in with the
              password they already know. Forgotten? Set a new one with them from the account row below.
            </p>
          )}
        </div>
      </div>
      <p className="mt-3 text-[11px] text-white/50">
        Shown once and stored nowhere readable — hand the card over now, or send it from your own WhatsApp.
        {card.emailSent
          ? " We also emailed them the sign-in address (never the password)."
          : ` No email went out${card.emailReason ? ` (${card.emailReason})` : ""} — the card is the handover.`}
      </p>
    </div>
  );
}
