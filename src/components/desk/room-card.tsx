"use client";

// THE ROOM ACCESS CARD — the one printed thing that makes the no-account path work.
//
// Two secrets exist for a stay and both are created at check-in, shown once, and die
// at check-out (see src/lib/room-session.ts):
//
//   * the PIN on the key sleeve  — the universal method, typed as room + 4 digits
//   * the QR link                — the same session, opened by scanning
//
// This file renders both on screen and on paper, and it is deliberate about the QR:
// a QR picture is only drawn when the motel has configured its own generator
// (`NEXT_PUBLIC_QR_IMAGE_BASE`, e.g. an on-site label printer or an internal
// service). We never hand a guest's room token to a public QR website — the token IS
// the credential, and putting it in a stranger's access log would be handing out the
// key. Without that setting the card prints the PIN in large type and the link as
// text for the office's own QR tool.

import { Printer, QrCode } from "lucide-react";
import { BTN_PRIMARY, CARD } from "./shared";

export type RoomAccessCard = {
  roomNumber: string;
  guestName: string;
  /** Shown once and never again — null when the desk did not just issue one. */
  pin: string | null;
  roomUrl: string | null;
  checkOut?: string | null;
  hotelName?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : "&#39;",
  );
}

/** The QR picture, when (and only when) the motel hosts its own generator. */
export function qrImageUrl(data: string) {
  const base = process.env.NEXT_PUBLIC_QR_IMAGE_BASE;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}${encodeURIComponent(data)}`;
}

/**
 * Open the print dialog on a card the desk can cut out and put in the room. Plain
 * HTML in a new window: it needs nothing installed on the front-desk machine.
 */
export function printRoomCard(card: RoomAccessCard) {
  const hotel = card.hotelName ?? "SUNRISE MOTEL";
  const qr = card.roomUrl ? qrImageUrl(card.roomUrl) : null;
  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Room ${escapeHtml(card.roomNumber)} access card</title>
<style>
  @page { margin: 12mm; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #171513; }
  .card { border: 2px solid #171513; border-radius: 10px; padding: 16px 18px; max-width: 420px; }
  .hotel { font-size: 11px; letter-spacing: 0.22em; font-weight: 700; color: #c95612; }
  .room { font-size: 40px; font-weight: 800; line-height: 1.05; margin-top: 4px; }
  .guest { font-size: 13px; margin-top: 2px; }
  .row { display: flex; gap: 16px; align-items: flex-start; margin-top: 14px; }
  .pinbox { flex: 1; }
  .pinlabel { font-size: 10px; letter-spacing: 0.16em; font-weight: 700; color: #6b6560; }
  .pin { font-size: 34px; font-weight: 800; letter-spacing: 0.28em; }
  .qr { width: 116px; height: 116px; border: 1px dashed #9b938c; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 9px; color: #6b6560; padding: 4px; }
  .qr img { width: 100%; height: 100%; }
  .link { margin-top: 12px; font-size: 10px; word-break: break-all; color: #49372f; }
  ol { margin: 10px 0 0 16px; padding: 0; font-size: 11px; line-height: 1.5; }
  .foot { margin-top: 12px; font-size: 10px; color: #6b6560; }
</style></head>
<body>
  <div class="card">
    <div class="hotel">${escapeHtml(hotel)} · ROOM SERVICE &amp; FRONT DESK</div>
    <div class="room">Room ${escapeHtml(card.roomNumber)}</div>
    <div class="guest">${escapeHtml(card.guestName)}${card.checkOut ? ` · until ${escapeHtml(card.checkOut)}` : ""}</div>
    <div class="row">
      <div class="pinbox">
        <div class="pinlabel">SCAN THE CODE</div>
        <div class="qr">${qr ? `<img src="${escapeHtml(qr)}" alt="Room access code" />` : "Paste the link below into the label printer's QR tool, then stick that QR here."}</div>
      </div>
      <div class="pinbox">
        <div class="pinlabel">OR TYPE THIS PIN</div>
        <div class="pin">${escapeHtml(card.pin ?? "••••")}</div>
        <div class="foot">Room number + these digits</div>
      </div>
    </div>
    ${card.roomUrl ? `<div class="link">${escapeHtml(card.roomUrl)}</div>` : ""}
    <ol>
      <li>Point your phone camera at the code, or open <strong>/room</strong> and type your room number and the PIN.</li>
      <li>Order food to the room, follow your bill, message the front desk — no account, no password, nothing to install.</li>
      <li>Everything also works at the counter: just ask.</li>
    </ol>
    <div class="foot">This card stops working the moment this stay ends. A photograph of it will not open anything afterwards.</div>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body></html>`;

  const win = window.open("", "_blank", "width=520,height=680");
  if (!win) return false; // Pop-up blocked: the on-screen card is the fallback.
  win.document.write(html);
  win.document.close();
  return true;
}


/** The same card, on screen, with the PIN the desk has to read out. */
export default function RoomAccessCardPanel({ card }: { card: RoomAccessCard }) {
  const qr = card.roomUrl ? qrImageUrl(card.roomUrl) : null;
  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-[#f8c66b]">
          Room {card.roomNumber} · access card
        </p>
        <button className={BTN_PRIMARY} type="button" onClick={() => printRoomCard(card)}>
          <Printer size={14} /> Print the card
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">PIN for the key sleeve</p>
          <p className="text-3xl font-black tracking-[0.3em] text-white">{card.pin ?? "••••"}</p>
          <p className="text-[11px] text-white/50">Shown once — write it on the sleeve now.</p>
        </div>
        <div className="min-w-[14rem] flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">
            QR link (stops working at check-out)
          </p>
          {qr ? (
            <img className="mt-1 h-24 w-24 rounded bg-white p-1" src={qr} alt="QR code for the room access link" />
          ) : (
            <p className="mt-1 flex items-center gap-2 text-[11px] text-white/60">
              <QrCode size={14} /> No QR generator is configured (<code>NEXT_PUBLIC_QR_IMAGE_BASE</code>) — the printed
              sheet carries the link for the office&apos;s own QR tool.
            </p>
          )}
          {card.roomUrl && (
            <p className="mt-1 break-all text-[11px] text-white/70">
              {card.roomUrl}
              <button
                className="ml-2 underline"
                type="button"
                onClick={() => void navigator.clipboard?.writeText(card.roomUrl ?? "")}
              >
                copy
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

