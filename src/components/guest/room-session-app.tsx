// THE NO-ACCOUNT GUEST SCREEN (/room) — the third way into the system.
//
// A guest who never made an account, standing in Room 104, gets in with ONE of:
//   * the QR card on the nightstand      (`/room?qr=…`)
//   * the room number + the PIN on the key sleeve
//   * their booking reference + the phone they booked with
//
// Everything after that is the same as the app: the same menu, the same room bill,
// the same private line to the desk, the same running total. The ONLY difference is
// the nudge at the top, which offers an account as an upgrade and says plainly that
// nothing on this screen depends on it.

"use client";

import { BedDouble, Bell, CreditCard, Loader2, LogOut, MessageSquare, QrCode, Sparkles, UtensilsCrossed, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import InstallAppButton from "@/components/install-app";
import { WhatsOnFeed, useWhatsOnFeed } from "./whats-on";

type MenuItem = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  imageUrl: string;
  isAvailable: boolean;
  isSpecial: boolean;
};

type RoomView = {
  active: boolean;
  methods?: string[];
  pinRules?: { length: number; maxAttempts: number; lockMinutes: number };
  hint?: string;
  channel?: string;
  session?: { sessionId: string; roomNumber: string; guestName: string; via: string };
  stay?: {
    bookingId: string;
    reference: string;
    roomNumber: string | null;
    roomType: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    adults: number;
    children: number;
    status: string;
    nightlyRate: number;
  } | null;
  folio?: {
    total: number;
    byCategory: Record<string, number>;
    amountPaid: number;
    balanceDue: number;
    items: { id: string; category: string; description: string; qty: number; unitPrice: number; amount: number; createdAt: string }[];
  };
  orders?: {
    id: string;
    orderNumber: string;
    status: string;
    channel: string;
    total: number;
    note: string | null;
    placedAt: string;
    deliveredAt: string | null;
    rejectedReason: string | null;
    items: { id: string; name: string; qty: number; amount: number }[];
  }[];
  threads?: {
    id: string;
    subject: string | null;
    kind: string;
    status: string;
    lastMessageAt: string;
    messages: { id: string; direction: string; body: string; kind: string; createdAt: string }[];
  }[];
  requests?: { id: string; kind: string; note: string | null; status: string; priority: string; dueBy: string | null; createdAt: string }[];
  menu?: MenuItem[];
  service?: { open: number; close: number; isOpen: boolean; hour: number; openLabel: string; closeLabel: string };
  upgrade?: { headline: string; body: string; actionLabel: string; actionHref: string; reassurance: string } | null;
};

const money = (value: number | null | undefined) => `MWK ${Math.round(value ?? 0).toLocaleString("en-US")}`;

const QUICK = [
  { kind: "towels", label: "Towels" },
  { kind: "cleaning", label: "Clean the room" },
  { kind: "linen", label: "Fresh linen" },
  { kind: "amenity", label: "Extra pillows / water" },
  { kind: "maintenance", label: "Something is broken" },
  { kind: "taxi", label: "Book a taxi" },
  { kind: "wake_up", label: "Wake-up call" },
];

type Mode = "qr" | "pin" | "reference";

export default function RoomSessionApp() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<RoomView | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [mode, setMode] = useState<Mode>("pin");
  const [roomNumber, setRoomNumber] = useState("");
  const [pin, setPin] = useState("");
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  /** The published feed — same rows as the website and the account app. */
  const whatsOn = useWhatsOnFeed();
  const [message, setMessage] = useState("");
  const [entryError, setEntryError] = useState("");
  /**
   * The room form lives in a popup, exactly like the order, reservation and
   * enquiry forms on /dine, /unwind and /connect: the page explains the three ways
   * in, and the sheet asks for the one the guest picked. Keeping it closed by
   * default also means the guest is never staring at a password box before they
   * know why they would want one.
   */
  const [entryOpen, setEntryOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/guest/room-session");
      setView((await response.json()) as RoomView);
    } catch {
      setView(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 7000);
    return () => clearTimeout(timer);
  }, [toast]);

  /** The QR card is only a pointer, so a scanned link signs the guest in by itself. */
  const openWithQr = useCallback(
    async (token: string) => {
      setBusy(true);
      try {
        const response = await fetch("/api/guest/room-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qrToken: token }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(data.error ?? "That card is not active.");
        await load();
      } catch (error) {
        // A card that was cleared at check-out, or re-pointed at the new guest:
        // say so plainly and open the sheet on the key-sleeve PIN, which always
        // works. (The sheet has to open — that is where the form lives now.)
        setEntryError(error instanceof Error ? error.message : "That card is not active.");
        setMode("pin");
        setEntryOpen(true);
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("qr");
    if (!token) {
      setMode("pin");
      return;
    }
    const clean = window.location.pathname;
    window.history.replaceState(null, "", clean);
    void openWithQr(token);
  }, [openWithQr]);

  const post = async (url: string, body: Record<string, unknown>, method = "POST") => {
    setBusy(true);
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "That did not work.");
      await load();
      return data;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "That did not work.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const enter = async (event: React.FormEvent) => {
    event.preventDefault();
    setEntryError("");
    setBusy(true);
    try {
      const payload =
        mode === "pin" ? { roomNumber, pin } : mode === "reference" ? { reference, phone } : {};
      const response = await fetch("/api/guest/room-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "We could not open the room menu.");
      setPin("");
      await load();
    } catch (error) {
      setEntryError(error instanceof Error ? error.message : "We could not open the room menu.");
    } finally {
      setBusy(false);
    }
  };

  const forgetDevice = async () => {
    setBusy(true);
    try {
      await fetch("/api/guest/room-session", { method: "DELETE" });
      setCart({});
      // Back to the landing state of this screen: explanation first, sheet closed.
      setEntryOpen(false);
      await load();
      setToast("This device has forgotten the room. The room itself is untouched.");
    } finally {
      setBusy(false);
    }
  };

  const cartLines = Object.entries(cart).filter(([, qty]) => qty > 0);
  const cartTotal = cartLines.reduce((sum, [id, qty]) => {
    const item = view?.menu?.find((entry) => entry.id === id);
    return sum + (item ? item.price * qty : 0);
  }, 0);


  if (loading) {
    return (
      <main className="room-session-page flex min-h-screen items-center justify-center bg-[var(--ivory)]">
        <Loader2 className="animate-spin text-[var(--orange-deep)]" />
      </main>
    );
  }

  // ------------------------------------------------------------------ entry ----
  if (!view?.active) {
    return (
      <main className="room-session-page min-h-screen bg-[var(--ivory)] px-4 py-8">
        <div className="mx-auto max-w-md">
          <p className="text-[11px] font-black tracking-widest text-[var(--orange-deep)]">SUNRISE MOTEL</p>
          <h1 className="mt-2 text-2xl font-bold">Your room, right now</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Order food to your room, follow your bill and message the front desk — no app, no password, no account.
          </p>

          {/* THE THREE WAYS IN — explained on the page, asked for in the popup.
              This is the same shape as /dine, /unwind and /connect: one short
              invitation, one button, and the form itself in the sheet, so the guest
              reads why before they are asked for a number. */}
          <div className="mt-5 rounded-xl border border-[var(--line)] bg-white p-5">
            <h2 className="text-sm font-bold">Three ways in — use whichever is in front of you</h2>
            <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
              <li>
                <strong className="text-[var(--ink)]">QR card</strong> on the nightstand — point your camera at it and
                this screen opens by itself.
              </li>
              <li>
                <strong className="text-[var(--ink)]">Room number + PIN</strong> from your key sleeve.
              </li>
              <li>
                <strong className="text-[var(--ink)]">Booking reference</strong> plus the phone number you booked with.
              </li>
            </ul>
            <button
              className="admin-btn admin-btn-primary mt-4 w-full justify-center"
              type="button"
              onClick={() => {
                setEntryError("");
                setEntryOpen(true);
              }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <BedDouble size={14} />} Open my room menu
            </button>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Everything on this screen is free of charge to open: the room menu, the running bill and the private line
              to the front desk.
            </p>
          </div>

          {/* An error from a card that no longer works is still worth showing here,
              in case the guest has closed the sheet. */}
          {entryError && !entryOpen && (
            <p className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{entryError}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <InstallAppButton label="Get the app" />
            <span className="text-[11px] text-[var(--muted)]">Optional — the same screens, with an icon on your phone.</span>
          </div>
        </div>

        {/* THE ROOM FORM POPUP */}
        {entryOpen && (
          <div
            className="booking-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Open your room menu"
            onClick={(event) => {
              if (event.target === event.currentTarget) setEntryOpen(false);
            }}
          >
            <div className="booking-modal-sheet">
              <button
                className="sheet-close-btn"
                type="button"
                onClick={() => setEntryOpen(false)}
                aria-label="Close the room form"
              >
                <X size={20} />
              </button>
              <div className="modal-sheet-header">
                <span className="eyebrow">
                  <span className="eyebrow-line" /> NO ACCOUNT · NO PASSWORD
                </span>
                <h2>Open your room menu</h2>
                <p>
                  One of the three below is all it takes. Nothing you order waits on the mobile app — this screen is the
                  app.
                </p>
              </div>

              <div className="mt-4 flex gap-1 rounded-lg border border-[var(--line)] bg-white p-1">
                {(
                  [
                    { id: "pin", label: "Room + PIN", icon: BedDouble },
                    { id: "reference", label: "Reference", icon: CreditCard },
                    { id: "qr", label: "QR card", icon: QrCode },
                  ] as { id: Mode; label: string; icon: typeof BedDouble }[]
                ).map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setMode(option.id)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-2 text-[11px] font-bold ${
                        mode === option.id ? "bg-[var(--orange-deep)] text-white" : "text-[var(--muted)]"
                      }`}
                    >
                      <Icon size={13} /> {option.label}
                    </button>
                  );
                })}
              </div>

              {entryError && (
                <p className="mt-4 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{entryError}</p>
              )}

              {mode === "qr" ? (
                <div className="mt-4">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <QrCode size={15} className="text-[var(--orange-deep)]" /> Scan the card on the nightstand
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Point your camera at the QR card in your room. The card is only a pointer: it is re-pointed at the new
                guest at every check-in and cleared at check-out, so a photograph of it stops working the day you leave.
              </p>
              <p className="mt-3 text-xs text-[var(--muted)]">
                No card in the room? Use the room number and the PIN from your key sleeve, or your booking reference —
                both are on the tabs above.
              </p>
              <button
                type="button"
                className="admin-btn mt-4 w-full justify-center"
                onClick={() => setEntryOpen(false)}
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={enter} className="mt-4 space-y-3">
              {mode === "pin" ? (
                <>
                  <label className="block text-sm font-semibold">
                    Room number
                    <input
                      className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 font-normal"
                      value={roomNumber}
                      onChange={(event) => setRoomNumber(event.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    {`${view?.pinRules?.length ?? 4}-digit PIN from your key sleeve`}
                    <input
                      className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 text-center text-lg font-normal tracking-[0.4em]"
                      value={pin}
                      onChange={(event) => setPin(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="block text-sm font-semibold">
                    Booking reference
                    <input
                      className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 font-normal"
                      value={reference}
                      onChange={(event) => setReference(event.target.value.toUpperCase())}
                      placeholder="e.g. SM-2026-0148"
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Phone number you booked with
                    <input
                      className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 font-normal"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="+265 …"
                      inputMode="tel"
                    />
                  </label>
                </>
              )}
              <button className="admin-btn admin-btn-primary w-full justify-center" type="submit" disabled={busy}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : null} Open my room menu
              </button>
              <p className="text-xs text-[var(--muted)]">
                {mode === "pin"
                  ? `The PIN is 4 digits, never your room number, and it locks after ${view?.pinRules?.maxAttempts ?? 3} wrong tries — ask the desk for a fresh one.`
                  : "We only check the last 6 digits of the number you booked with, so any format works."}
              </p>
            </form>
          )}
            </div>
          </div>
        )}
      </main>
    );
  }


  // ------------------------------------------------------------- inside room ----
  const stay = view.stay;
  const folio = view.folio;
  const service = view.service;
  const viaLabel =
    view.channel === "qr" ? "QR card in the room" : view.channel === "pin" ? "key-sleeve PIN" : view.channel === "reference" ? "booking reference" : "opened by the desk";

  return (
    <main className="room-session-page min-h-screen bg-[var(--ivory)] pb-24">
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black tracking-widest text-[var(--orange-deep)]">SUNRISE MOTEL</p>
            <h1 className="text-sm font-bold">
              {view.session?.guestName}
              {view.session?.roomNumber ? ` · Room ${view.session.roomNumber}` : ""}
            </h1>
            <p className="text-[11px] text-[var(--muted)]">
              In via the {viaLabel} · {stay ? `${stay.checkIn} → ${stay.checkOut}` : "no active stay found"}
            </p>
          </div>
          <button className="admin-btn" onClick={forgetDevice} disabled={busy} type="button">
            <LogOut size={13} /> Forget this device
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        {toast && (
          <p className="rounded border border-[var(--orange-deep)]/40 bg-white p-3 text-sm text-[var(--ink)]">{toast}</p>
        )}

        {/* The upgrade is offered, never required — and it says so in its own words. */}
        {view.upgrade && (
          <section className="rounded-xl border border-[var(--line)] bg-white p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <Sparkles size={15} className="text-[var(--orange-deep)]" /> {view.upgrade.headline}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{view.upgrade.body}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">{view.upgrade.reassurance}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a className="admin-btn admin-btn-primary" href={view.upgrade.actionHref}>
                {view.upgrade.actionLabel}
              </a>
              <button
                type="button"
                className="admin-btn"
                onClick={() => setToast("Not now. Everything on this screen keeps working without an account.")}
              >
                Not now
              </button>
            </div>
          </section>
        )}

        {stay && (
          <section className="rounded-xl border border-[var(--line)] bg-white p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <BedDouble size={15} className="text-[var(--orange-deep)]" /> Your stay
            </h2>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--muted)] sm:grid-cols-4">
              <div>
                <dt className="font-semibold text-[var(--ink)]">Reference</dt>
                <dd>{stay.reference}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--ink)]">Room</dt>
                <dd>{stay.roomNumber ?? "not assigned yet"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--ink)]">Nights</dt>
                <dd>
                  {stay.nights} · {stay.adults} adult{stay.adults === 1 ? "" : "s"}
                  {stay.children ? `, ${stay.children} child${stay.children === 1 ? "" : "ren"}` : ""}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[var(--ink)]">Rate</dt>
                <dd>{money(stay.nightlyRate)} / night</dd>
              </div>
            </dl>
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              Your room number is attached to every order automatically — you never type it.
            </p>
          </section>
        )}

        <section className="rounded-xl border border-[var(--line)] bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Bell size={15} className="text-[var(--orange-deep)]" /> Ask for something
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">One tap. Housekeeping sees it against your room straight away.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK.map((item) => (
              <button
                key={item.kind}
                type="button"
                className="admin-btn"
                disabled={busy}
                onClick={() => post("/api/guest/requests", { kind: item.kind, note })}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input
            className="mt-3 w-full rounded border border-[var(--line)] px-3 py-2 text-sm"
            placeholder="Anything to add? (optional)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          {view.requests && view.requests.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-[var(--muted)]">
              {view.requests.slice(0, 6).map((task) => (
                <li key={task.id} className="flex justify-between border-b border-[var(--line)] pb-1">
                  <span>
                    {task.kind.replace("_", " ")}
                    {task.note ? ` · ${task.note}` : ""}
                  </span>
                  <span className="font-semibold uppercase">
                    {task.status}
                    {task.priority !== "normal" ? ` · ${task.priority}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>


        <section className="rounded-xl border border-[var(--line)] bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <UtensilsCrossed size={15} className="text-[var(--orange-deep)]" /> Food &amp; drinks
          </h2>
          {service && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              {service.isOpen
                ? `Kitchen is open — last orders ${service.closeLabel}.`
                : `Kitchen is closed (open ${service.openLabel}–${service.closeLabel}). You can still send the order and the desk will call you back.`}
            </p>
          )}
          <div className="mt-3 space-y-2">
            {(view.menu ?? [])
              .filter((item) => item.isAvailable)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2"
                >
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-sm font-semibold">
                      {item.name}
                      {item.isSpecial ? <span className="ml-2 text-[10px] font-black text-[var(--orange-deep)]">TODAY</span> : null}
                    </p>
                    <p className="text-xs text-[var(--muted)]">{item.description}</p>
                  </div>
                  <span className="text-sm font-bold">{money(item.price)}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="admin-btn"
                      disabled={busy}
                      onClick={() => setCart((current) => ({ ...current, [item.id]: Math.max(0, (current[item.id] ?? 0) - 1) }))}
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{cart[item.id] ?? 0}</span>
                    <button
                      type="button"
                      className="admin-btn"
                      disabled={busy}
                      onClick={() => setCart((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 }))}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
          </div>
          {cartLines.length > 0 && (
            <div className="mt-3 rounded border border-[var(--line)] bg-[var(--ivory)] p-3">
              <p className="text-xs text-[var(--muted)]">
                {cartLines.length} line{cartLines.length === 1 ? "" : "s"} · {money(cartTotal)}
              </p>
              <input
                className="mt-2 w-full rounded border border-[var(--line)] px-3 py-2 text-sm"
                placeholder="Any notes for the kitchen? (no nuts, extra chilli …)"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  className="admin-btn admin-btn-primary"
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const done = await post("/api/guest/orders", {
                      items: cartLines.map(([id]) => ({ menuItemId: id, qty: cart[id] })),
                      note: note || undefined,
                      channel: view.channel,
                    });
                    if (done) {
                      setCart({});
                      setNote("");
                      setToast("Order sent to the kitchen. It will show up below as it moves.");
                    }
                  }}
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : null} Send to the kitchen
                </button>
                <button className="admin-btn" type="button" onClick={() => setCart({})} disabled={busy}>
                  Clear
                </button>
              </div>
              <p className="mt-2 text-[11px] text-[var(--muted)]">
                This is charged to your room and appears on your room bill below.
              </p>
            </div>
          )}
          {view.orders && view.orders.length > 0 && (
            <ul className="mt-3 space-y-2 text-xs">
              {view.orders.slice(0, 5).map((order) => (
                <li key={order.id} className="rounded border border-[var(--line)] p-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-semibold">
                      {order.orderNumber} · {order.items.map((line) => `${line.qty}× ${line.name}`).join(", ")}
                    </span>
                    <span className="font-bold uppercase text-[var(--muted)]">{order.status}</span>
                  </div>
                  {order.note ? <p className="mt-1 text-[var(--muted)]">Note: {order.note}</p> : null}
                  {order.rejectedReason ? (
                    <p className="mt-1 text-red-700">Sorry — {order.rejectedReason}</p>
                  ) : null}
                  <p className="mt-1 text-[var(--muted)]">
                    {money(order.total)} · placed {new Date(order.placedAt).toLocaleString()}
                    {order.deliveredAt ? ` · delivered ${new Date(order.deliveredAt).toLocaleTimeString()}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>



        {/* WHAT'S ON — the no-account guest sees exactly the same feed as the account
            holder, because the app is an advantage and never a requirement (Part 7).
            One published post reaches the website, the app and this screen at once. */}
        <section className="rounded-xl border border-[var(--line)] bg-white p-4">
          <WhatsOnFeed
            posts={whatsOn.posts}
            loading={whatsOn.loading}
            error={whatsOn.error}
            onRetry={() => void whatsOn.reload()}
            heading="What's on while you are here"
            intro="Events, specials and offers the desk has published — the same list the website and the app show."
          />
        </section>

        {folio && (
          <section className="rounded-xl border border-[var(--line)] bg-white p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <CreditCard size={15} className="text-[var(--orange-deep)]" /> Your room bill
            </h2>
            <p className="mt-2 text-2xl font-bold">{money(folio.balanceDue)}</p>
            <p className="text-xs text-[var(--muted)]">
              outstanding · {money(folio.total)} total · {money(folio.amountPaid)} paid
            </p>
            <ul className="mt-3 space-y-1 text-xs">
              {folio.items.slice(-8).map((item) => (
                <li key={item.id} className="flex justify-between border-b border-[var(--line)] pb-1">
                  <span>
                    {item.qty}× {item.description}
                    <span className="ml-1 text-[var(--muted)]">({item.category})</span>
                  </span>
                  <span className="font-semibold">{money(item.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-[var(--muted)]">
              You settle at the desk on check-out — nothing here takes a card, and you can ask for a printed folio any
              time.
            </p>
          </section>
        )}

        <section className="rounded-xl border border-[var(--line)] bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <MessageSquare size={15} className="text-[var(--orange-deep)]" /> Message the front desk
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            A private thread tied to your room. The desk answers from the same screen they use for everything else.
          </p>
          {view.threads && view.threads.length > 0 ? (
            <div className="mt-3 space-y-3">
              {view.threads.slice(0, 3).map((thread) => (
                <div key={thread.id} className="rounded border border-[var(--line)] p-2">
                  <p className="text-xs font-semibold">
                    {thread.subject ?? thread.kind.replace("_", " ")} · {thread.status}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {thread.messages.slice(-6).map((entry) => (
                      <li
                        key={entry.id}
                        className={`rounded px-2 py-1 text-xs ${
                          entry.direction === "inbound" ? "bg-[var(--ivory)]" : "bg-[var(--orange-deep)]/10"
                        }`}
                      >
                        <span className="font-semibold">{entry.direction === "inbound" ? "You" : "Desk"}:</span>{" "}
                        {entry.body}
                        <span className="ml-1 text-[10px] text-[var(--muted)]">
                          {new Date(entry.createdAt).toLocaleTimeString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-[var(--muted)]">No messages yet.</p>
          )}
          <textarea
            className="mt-3 w-full rounded border border-[var(--line)] px-3 py-2 text-sm"
            rows={3}
            placeholder="Type your message…"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <button
            className="admin-btn admin-btn-primary mt-2"
            type="button"
            disabled={busy || message.trim().length === 0}
            onClick={async () => {
              const done = await post("/api/guest/messages", { body: message, channel: view.channel });
              if (done) {
                setMessage("");
                setToast("Sent. The desk sees it against your room and will answer here.");
              }
            }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Send message
          </button>
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--ivory)] p-4 text-xs text-[var(--muted)]">
          <p className="font-semibold text-[var(--ink)]">This device is a guest, not you</p>
          <p className="mt-1">
            Your room menu is open on this phone because the room is occupied. Tapping <em>Forget this device</em> closes
            it here and nowhere else; the desk can cut every device off at once from the room access screen.
          </p>
          <p className="mt-1">
            If you see this screen on a phone that is not yours, tap <em>Forget this device</em> and tell the front desk.
          </p>
        </section>
      </div>
    </main>
  );
}
