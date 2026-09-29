"use client";

import { BedDouble, Loader2, LogIn, LogOut, UserPlus, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import RoomAccessCardPanel, { type RoomAccessCard } from "./room-card";
import GuestCredentialsPanel, { type GuestCredentials } from "./guest-credentials-card";
import { api, BTN, BTN_DANGER, BTN_PRIMARY, CARD, INPUT, money, ROOM_STATE_LABEL, ROOM_STATE_STYLE } from "./shared";

type RoomRow = {
  id: string;
  roomNumber: string;
  roomType: string;
  floor: string | null;
  state: string;
  oooReason: string | null;
  oooUntil: string | null;
  occupant: {
    bookingId: string; reference: string; guestName: string; phone: string; checkIn: string; checkOut: string;
    status: string; guestId: string | null; appAccount: string | null;
  } | null;
  arrivalToday: { bookingId: string; reference: string; guestName: string; status: string } | null;
  departureToday: { reference: string; guestName: string } | null;
  openIssues: number;
  emergency: boolean;
  openTasks: number;
  folio: { balance: number; openItems: number };
};

const STATES = ["available", "dirty", "clean", "inspected", "out_of_order"];

export default function DeskRooms({
  onChanged,
  setToast,
  readOnly,
}: {
  rooms: { id: string; roomNumber: string; roomType: string; state: string }[];
  onChanged: () => Promise<void>;
  setToast: (message: string) => void;
  readOnly: boolean;
}) {
  const [map, setMap] = useState<RoomRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<RoomRow | null>(null);
  const [oooReason, setOooReason] = useState("");
  const [oooUntil, setOooUntil] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [roomCard, setRoomCard] = useState<RoomAccessCard | null>(null);
  /** The password the SYSTEM chose, held in memory only until the card is printed. */
  const [credentials, setCredentials] = useState<GuestCredentials | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ rooms: RoomRow[] }>("/api/desk/rooms");
    setMap(data.rooms);
    setSelected((current) => data.rooms.find((r) => r.id === current?.id) ?? null);
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
      setToast(error instanceof Error ? error.message : "That action failed.");
    } finally {
      setBusy(false);
    }
  };

  const assign = (room: RoomRow, bookingId: string) =>
    run(`Booking assigned to Room ${room.roomNumber}.`, () =>
      api("/api/desk/rooms", { method: "PATCH", body: JSON.stringify({ roomId: room.id, bookingId }) }),
    );

  const setState = (room: RoomRow, state: string) =>
    run(`Room ${room.roomNumber} set to ${ROOM_STATE_LABEL[state] ?? state}.`, () =>
      api("/api/desk/rooms", {
        method: "PATCH",
        body: JSON.stringify({ roomId: room.id, state, reason: oooReason, until: oooUntil }),
      }),
    );

  const stayAction = (bookingId: string, action: string, label: string) =>
    run(label, () => api("/api/desk/stay", { method: "POST", body: JSON.stringify({ bookingId, action }) }));

  /**
   * Check-in also opens the room access for the stay: a fresh 4-digit PIN and a QR
   * link that only work while the guest is in house. Both come back ONCE, so they go
   * straight onto the card the desk prints — losing them means rotating the PIN, not
   * digging them out of a log (they are never written to one).
   */
  const checkIn = (room: RoomRow) =>
    run(`${room.occupant?.guestName ?? "Guest"} is checked in to Room ${room.roomNumber} — print the card and write the PIN on the key sleeve.`, async () => {
      const result = await api<{
        roomNumber: string;
        roomAccess: { pin: string; roomUrl: string; qrToken: string };
      }>("/api/desk/stay", {
        method: "POST",
        body: JSON.stringify({ bookingId: room.occupant!.bookingId, action: "check_in" }),
      });
      setRoomCard({
        roomNumber: result.roomNumber,
        guestName: room.occupant?.guestName ?? "Guest",
        pin: result.roomAccess.pin,
        roomUrl: result.roomAccess.roomUrl,
        checkOut: room.occupant?.checkOut ?? null,
      });
    });

  /**
   * THE FRONT DESK IS THE DOORWAY (see desk-guests.tsx): the desk types the email,
   * the SYSTEM picks the password, and it comes back once for the card that is handed
   * over. `invite` is still here for the guest who would rather be emailed a link and
   * choose a password themselves — it is no longer the way in, just an option.
   */
  const register = (room: RoomRow) =>
    run("Account registered — hand over the sign-in card.", async () => {
      const email = inviteEmail.trim();
      if (!email) throw new Error("Type the email address the guest will sign in with.");
      const data = await api<{
        result: {
          loginEmail: string;
          password: string | null;
          existingAccount: boolean;
          roomNumber: string | null;
          checkOut: string | null;
          emailSent: boolean;
          emailReason: string | null;
        };
      }>("/api/desk/guests", {
        method: "POST",
        body: JSON.stringify({ action: "register", bookingId: room.occupant!.bookingId, login: email }),
      });
      setCredentials({
        guestName: room.occupant?.guestName ?? "Guest",
        loginEmail: data.result.loginEmail,
        password: data.result.password,
        roomNumber: data.result.roomNumber,
        checkOut: data.result.checkOut,
        guestPhone: room.occupant?.phone ?? null,
        emailSent: data.result.emailSent,
        emailReason: data.result.emailReason,
      });
    });

  const invite = (bookingId: string) =>
    run("Guest account created — the activation email has been sent (or the code is shown for you to read out).", async () => {
      const data = await api<{
        result: {
          activationLink: string | null;
          activationOtp: string | null;
          existingAccount: boolean;
          emailSent: boolean;
          emailReason: string | null;
        };
      }>("/api/desk/guests", {
        method: "POST",
        body: JSON.stringify({ action: "invite", bookingId, login: inviteEmail || undefined }),
      });
      if (data.result.existingAccount) {
        setToast("This guest already has an account — the stay is linked and they were told it is active.");
      } else if (!data.result.emailSent) {
        setToast(
          `Invitation saved but not emailed (${data.result.emailReason ?? "SMTP unavailable"}). Code to read out: ${data.result.activationOtp ?? "—"}`,
        );
      }
    });

  const floors = [...new Set(map.map((room) => room.floor ?? "—"))].sort();
  return (
    <div className="space-y-4">
      {credentials && (
        <section>
          <GuestCredentialsPanel credentials={credentials} />
          <button className={`${BTN} mt-2`} type="button" onClick={() => setCredentials(null)}>
            Done — the guest has the details
          </button>
        </section>
      )}
      {roomCard && (
        <section>
          <RoomAccessCardPanel card={roomCard} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={BTN} type="button" onClick={() => setRoomCard(null)}>
              Done — I have written the PIN down
            </button>
            <a className={BTN} href="/desk?tab=access">
              Manage room access
            </a>
          </div>
        </section>
      )}
      <section className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <BedDouble size={16} className="text-[#f8c66b]" /> Room map
        </h2>
        <span className="text-[11px] text-white/50">
          {map.length} rooms · {map.filter((r) => r.occupant).length} occupied ·{" "}
          {map.filter((r) => r.state === "out_of_order").length} out of order
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {Object.keys(ROOM_STATE_STYLE).map((state) => (
            <span
              key={state}
              className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${ROOM_STATE_STYLE[state]}`}
            >
              {ROOM_STATE_LABEL[state]}
            </span>
          ))}
        </div>
      </section>

      {floors.map((floor) => (
        <section key={floor} className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/45">Floor {floor}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {map
              .filter((room) => (room.floor ?? "—") === floor)
              .map((room) => (
                <button
                  key={room.id}
                  onClick={() => setSelected(room)}
                  className={`rounded-lg border p-3 text-left ${
                    ROOM_STATE_STYLE[room.state] ?? "border-white/10 bg-white/[0.03]"
                  } ${selected?.id === room.id ? "ring-2 ring-[#f28c18]" : ""}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-lg font-black">{room.roomNumber}</p>
                      <p className="text-[10px] uppercase tracking-wide opacity-80">{room.roomType}</p>
                    </div>
                    <div className="space-y-1 text-right text-[10px] font-bold">
                      {room.emergency && <span className="block text-rose-200">EMERGENCY</span>}
                      {room.openIssues > 0 && <span className="block">⚠ {room.openIssues} open</span>}
                      {room.openTasks > 0 && <span className="block">🔧 {room.openTasks} task</span>}
                      {room.folio.balance > 0 && <span className="block">bill {money(room.folio.balance)}</span>}
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-white/80">
                    {room.occupant
                      ? `${room.occupant.guestName} · ${room.occupant.checkIn} → ${room.occupant.checkOut}`
                      : ROOM_STATE_LABEL[room.state]}
                  </p>
                  {room.occupant?.appAccount && (
                    <p className="text-[10px] text-white/60">app account: {room.occupant.appAccount}</p>
                  )}
                  {room.arrivalToday && !room.occupant && (
                    <p className="text-[10px] text-white/70">arrival today: {room.arrivalToday.guestName}</p>
                  )}
                  {room.state === "out_of_order" && (
                    <p className="text-[10px] text-rose-100">
                      {room.oooReason ?? "maintenance"}
                      {room.oooUntil ? ` until ${room.oooUntil}` : ""}
                    </p>
                  )}
                </button>
              ))}
          </div>
        </section>
      ))}

      {selected && (
        <section className={CARD}>
          <header className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold">
              Room {selected.roomNumber} · {selected.roomType} · {ROOM_STATE_LABEL[selected.state]}
            </h3>
            <button className={BTN} onClick={() => setSelected(null)}>
              Close
            </button>
          </header>

          {selected.occupant ? (
            <div className="mb-4 rounded border border-white/10 bg-black/20 p-3">
              <p className="text-sm font-semibold">{selected.occupant.guestName}</p>
              <p className="text-[11px] text-white/60">
                {selected.occupant.reference} · {selected.occupant.checkIn} → {selected.occupant.checkOut} ·{" "}
                {selected.occupant.phone} · status {selected.occupant.status.replace("_", " ")}
              </p>
              <p className="mt-1 text-[11px] text-white/60">
                Room bill {money(selected.folio.balance)} ({selected.folio.openItems} open lines)
              </p>
              {!readOnly && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {selected.occupant.status !== "checked_in" && (
                    <button
                      className={BTN_PRIMARY}
                      disabled={busy}
                      onClick={() => checkIn(selected)}
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />} Check in &amp; print the card
                    </button>
                  )}
                  {selected.occupant.status === "checked_in" && (
                    <button
                      className={BTN}
                      disabled={busy}
                      onClick={() => {
                        // The printed card dies with the stay, so stop showing it.
                        setRoomCard(null);
                        void stayAction(
                          selected.occupant!.bookingId,
                          "check_out",
                          "Checked out — the room is dirty, the invoice was generated from the folio, and the room card stopped working.",
                        );
                      }}
                    >
                      <LogOut size={13} /> Check out
                    </button>
                  )}
                  <button
                    className={BTN_DANGER}
                    disabled={busy}
                    onClick={() => stayAction(selected.occupant!.bookingId, "no_show", "Marked no-show — room released.")}
                  >
                    <XCircle size={13} /> No-show
                  </button>
                  <button className={BTN_PRIMARY} disabled={busy} onClick={() => register(selected)}>
                    <UserPlus size={13} /> Register + show password
                  </button>
                  <button className={BTN} disabled={busy} onClick={() => invite(selected.occupant!.bookingId)}>
                    Email a link instead
                  </button>
                  <input
                    className={`${INPUT} max-w-[220px]`}
                    placeholder="email the guest signs in with"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="mb-4 space-y-2 rounded border border-white/10 bg-black/20 p-3">
              <p className="text-[11px] text-white/60">
                No in-house guest in this room. Assign one of today&apos;s unassigned arrivals to it.
              </p>
              <AssignPicker room={selected} onAssign={assign} busy={busy || readOnly} />
            </div>
          )}

          {!readOnly && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {STATES.map((state) => (
                  <button
                    key={state}
                    className={state === "out_of_order" ? BTN_DANGER : BTN}
                    disabled={busy}
                    onClick={() => setState(selected, state)}
                  >
                    {ROOM_STATE_LABEL[state]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  className={`${INPUT} max-w-[280px]`}
                  placeholder="out-of-order reason (e.g. geyser cold)"
                  value={oooReason}

                  onChange={(e) => setOooReason(e.target.value)}
                />
                <input
                  className={`${INPUT} max-w-[170px]`}
                  placeholder="until YYYY-MM-DD"
                  value={oooUntil}
                  onChange={(e) => setOooUntil(e.target.value)}
                />
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}


function AssignPicker({
  room,
  onAssign,
  busy,
}: {
  room: RoomRow;
  onAssign: (room: RoomRow, bookingId: string) => void;
  busy: boolean;
}) {
  const [arrivals, setArrivals] = useState<
    { id: string; reference: string; guestName: string; roomType: string; checkIn: string }[]
  >([]);
  const [value, setValue] = useState("");

  useEffect(() => {
    void api<{
      actionCentre: {
        unassignedArrivals: {
          list: { id: string; reference: string; guestName: string; roomType: string; checkIn: string }[];
        };
      };
    }>("/api/desk/overview").then((data) => setArrivals(data.actionCentre.unassignedArrivals.list));
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={`${INPUT} max-w-[340px]`} value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">Choose an unassigned arrival…</option>
        {arrivals.map((arrival) => (
          <option key={arrival.id} value={arrival.id}>
            {arrival.guestName} · {arrival.reference} · {arrival.roomType}
          </option>
        ))}
      </select>
      <button className={BTN_PRIMARY} disabled={busy || !value} onClick={() => onAssign(room, value)}>
        Assign
      </button>
    </div>
  );
}

