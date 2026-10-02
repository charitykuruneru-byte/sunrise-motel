"use client";

// ROOM ACCESS AT THE DESK (addendum "the two guest paths", Parts 16–17).
//
// Everything the counter needs to answer, without leaving the counter:
//
//   * which rooms have a phone inside them right now, who, and how they got in;
//   * which checked-in guest has NO access yet — the gap that leaves someone unable
//     to order a meal until somebody prints a card;
//   * rotate a forgotten PIN (shown once), close one lost phone, close a whole room,
//     or open access for a stay whose card was never printed.
//
// A session is not an account: it ends by itself at check-out, so nothing here has to
// be cleaned up at night.

import { KeyRound, Phone, Printer, QrCode, RefreshCw, ShieldOff, Users, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import RoomAccessCardPanel, { type RoomAccessCard, printRoomCard } from "./room-card";
import { api, BTN, BTN_DANGER, BTN_PRIMARY, CARD, INPUT } from "./shared";

type Session = {
  sessionId: string;
  roomNumber: string;
  guestName: string;
  reference: string | null;
  bookingId: string;
  openedVia: string;
  openedAt: string;
  lastSeenAt: string | null;
  pinAttempts: number;
  pinLocked: boolean;
  reachByPhoneOnly: boolean;
  guestPhone: string | null;
};

type Missing = { bookingId: string; reference: string; guestName: string; roomNumber: string | null };

type Payload = {
  sessions: Session[];
  checkedInWithoutSession: Missing[];
  pinRules: { length: number; maxAttempts: number; lockMinutes: number };
  note: string;
};

const VIA_LABEL: Record<string, string> = {
  qr: "QR card",
  pin: "key-sleeve PIN",
  reference: "reference + phone",
  desk: "opened by the desk",
};

function when(value: string | null) {
  if (!value) return "never";
  const date = new Date(value);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h ago`;
  return date.toLocaleString();
}

export default function DeskRoomAccess({
  onChanged,
  setToast,
  readOnly,
}: {
  onChanged: () => Promise<void>;
  setToast: (message: string) => void;
  readOnly: boolean;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<RoomAccessCard | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closingRoom, setClosingRoom] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setData(await api<Payload>("/api/desk/room-sessions"));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (label: string, work: () => Promise<unknown>) => {
    if (readOnly) return;
    setBusy(true);
    try {
      await work();
      await load();
      await onChanged();
      setToast(label);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "That room access action failed.");
    } finally {
      setBusy(false);
    }
  };

  const rotatePin = (session: Session) =>
    run(`A fresh PIN was issued for Room ${session.roomNumber} — write it on the key sleeve now.`, async () => {
      const result = await api<{ pin: string; roomNumber: string; note: string }>("/api/desk/room-sessions", {
        method: "POST",
        body: JSON.stringify({ action: "rotate_pin", sessionId: session.sessionId }),
      });
      setCard({
        roomNumber: result.roomNumber,
        guestName: session.guestName,
        pin: result.pin,
        roomUrl: null,
      });
    });

  const closeSession = (session: Session) =>
    run(`The phone in Room ${session.roomNumber} lost its access. The guest can be given a new card.`, () =>
      api("/api/desk/room-sessions", {
        method: "POST",
        body: JSON.stringify({
          action: "close",
          sessionId: session.sessionId,
          reason: reason || `closed at the desk by the front desk`,
        }),
      }).then(() => {
        setClosingId(null);
        setReason("");
      }),
    );

  const closeRoom = (roomNumber: string) =>
    run(`Every device was cut off from Room ${roomNumber}.`, () =>
      api("/api/desk/room-sessions", {
        method: "POST",
        body: JSON.stringify({ action: "close_room", roomNumber, reason: reason || "closed at the desk" }),
      }).then(() => {
        setClosingRoom(null);
        setReason("");
      }),
    );

  const reopen = (bookingId: string) =>
    run("Access opened — print the card and write the PIN on the key sleeve.", async () => {
      const result = await api<{
        pin: string;
        roomNumber: string;
        roomUrl: string;
        qrToken: string;
        note: string;
      }>("/api/desk/room-sessions", {
        method: "POST",
        body: JSON.stringify({ action: "reopen", bookingId }),
      });
      const guest = data?.checkedInWithoutSession.find((row) => row.bookingId === bookingId);
      setCard({
        roomNumber: result.roomNumber,
        guestName: guest?.guestName ?? "Guest",
        pin: result.pin,
        roomUrl: result.roomUrl,
        checkOut: null,
      });
    });

  const sessions = data?.sessions ?? [];
  const missing = data?.checkedInWithoutSession ?? [];

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <QrCode size={16} className="text-[#f8c66b]" /> Room access
        </h2>
        <span className="text-[11px] text-white/50">
          {sessions.length} live session{sessions.length === 1 ? "" : "s"} ·{" "}
          {missing.length} guest{missing.length === 1 ? "" : "s"} checked in without access
        </span>
        <button className={BTN} onClick={() => void load()} disabled={busy}>
          <RefreshCw size={14} /> Reload
        </button>
      </section>

      {card && (
        <section>
          <RoomAccessCardPanel card={card} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={BTN} type="button" onClick={() => printRoomCard(card)}>
              <Printer size={14} /> Print again
            </button>
            <button className={BTN} type="button" onClick={() => setCard(null)}>
              Hide
            </button>
          </div>
        </section>
      )}

      {missing.length > 0 && (
        <section className={CARD}>
          <p className="text-xs font-bold uppercase tracking-widest text-[#f8c66b]">
            Checked in, but no card printed ({missing.length})
          </p>
          <p className="mt-1 text-[11px] text-white/55">
            These guests cannot order to the room or message the desk until someone opens access. One tap issues the PIN
            and the QR link for the stay — it is never too late while they are in house.
          </p>
          <ul className="mt-3 space-y-2">
            {missing.map((row) => (
              <li
                key={row.bookingId}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2"
              >
                <span className="text-xs">
                  <strong>{row.guestName}</strong> · {row.reference}
                  {row.roomNumber ? ` · Room ${row.roomNumber}` : " · no physical room assigned yet"}
                </span>
                <button
                  className={BTN_PRIMARY}
                  disabled={busy || readOnly || !row.roomNumber}
                  onClick={() => void reopen(row.bookingId)}
                >
                  <KeyRound size={14} /> Open access &amp; issue PIN
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}


      <section className={CARD}>
        <p className="text-xs font-bold uppercase tracking-widest text-[#f8c66b]">Live sessions</p>
        {sessions.length === 0 ? (
          <p className="mt-2 text-xs text-white/55">
            Nobody is using the room menu right now. Access opens at check-in and ends at check-out — a guest who is not
            in house cannot get in.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {sessions.map((session) => (
              <li key={session.sessionId} className="rounded border border-white/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">
                      Room {session.roomNumber} · {session.guestName}
                    </p>
                    <p className="text-[11px] text-white/55">
                      {session.reference ?? "—"} · opened via {VIA_LABEL[session.openedVia] ?? session.openedVia} ·{" "}
                      {when(session.openedAt)} · last used {when(session.lastSeenAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${
                        session.pinLocked
                          ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      }`}
                    >
                      {session.pinLocked
                        ? `PIN locked ${data?.pinRules.lockMinutes ?? 15} min`
                        : `${session.pinAttempts}/${data?.pinRules.maxAttempts ?? 5} wrong PINs`}
                    </span>
                    <button className={BTN} disabled={busy || readOnly} onClick={() => void rotatePin(session)}>
                      <KeyRound size={14} /> New PIN
                    </button>
                    <button
                      className={BTN_DANGER}
                      disabled={busy || readOnly}
                      onClick={() => {
                        setClosingId(session.sessionId);
                        setClosingRoom(null);
                        setReason("");
                      }}
                    >
                      <ShieldOff size={14} /> Close
                    </button>
                  </div>
                </div>

                {session.reachByPhoneOnly && (
                  <p className="mt-2 flex items-center gap-2 text-[11px] text-amber-200">
                    <Phone size={12} /> No app on this stay — reply by phone or WhatsApp
                    {session.guestPhone ? `: ${session.guestPhone}` : " (number on the booking)"}.
                  </p>
                )}

                {closingId === session.sessionId && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      className={`${INPUT} max-w-sm`}
                      placeholder="Why? (lost phone, guest left, wrong room …)"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                    <button className={BTN_DANGER} disabled={busy} onClick={() => void closeSession(session)}>
                      Close this device
                    </button>
                    <button className={BTN} onClick={() => setClosingId(null)}>
                      <XCircle size={14} /> Cancel
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>


      {sessions.length > 0 && (
        <section className={CARD}>
          <p className="text-xs font-bold uppercase tracking-widest text-[#f8c66b]">Cut a whole room off</p>
          <p className="mt-1 text-[11px] text-white/55">
            Use this when a room should not be reachable at all — a house phone left behind, a stay the desk has just
            closed, or a room going out of service.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[...new Set(sessions.map((session) => session.roomNumber))].map((roomNumber) => (
              <button
                key={roomNumber}
                className={BTN_DANGER}
                disabled={busy || readOnly}
                onClick={() => {
                  setClosingRoom(roomNumber);
                  setClosingId(null);
                  setReason("");
                }}
              >
                <Users size={14} /> Room {roomNumber}
              </button>
            ))}
          </div>
          {closingRoom && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                className={`${INPUT} max-w-sm`}
                placeholder={`Why is Room ${closingRoom} being cut off?`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <button className={BTN_DANGER} disabled={busy} onClick={() => void closeRoom(closingRoom)}>
                Close every device in Room {closingRoom}
              </button>
              <button className={BTN} onClick={() => setClosingRoom(null)}>
                <XCircle size={14} /> Cancel
              </button>
            </div>
          )}
        </section>
      )}

      {card === null && data?.note && (
        <p className="rounded border border-white/10 bg-white/[0.02] p-3 text-[11px] text-white/55">
          {data.note} Sessions end by themselves at check-out, and a photographed QR card stops working the moment the
          stay ends. Re-printing a card is always one button away.
        </p>
      )}
    </div>
  );
}
