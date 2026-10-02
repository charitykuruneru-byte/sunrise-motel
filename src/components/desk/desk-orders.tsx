"use client";

import { Loader2, Timer, UtensilsCrossed } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, BTN, BTN_DANGER, BTN_PRIMARY, CARD, INPUT, money, ORDER_STATUS_LABEL } from "./shared";

type OrderLine = { id: string; name: string; qty: number; unitPrice: number; amount: number; status: string };
type Order = {
  id: string;
  orderNumber: string;
  roomNumber: string | null;
  guestName: string | null;
  guestPhone: string | null;
  status: string;
  service: string;
  note: string | null;
  total: number;
  placedAt: string;
  rejectedReason: string | null;
  waitingMinutes: number;
  overdue: boolean;
  items: OrderLine[];
};
type MenuImage = { name: string; imageUrl: string };

const COLUMNS: { key: "placed" | "accepted" | "preparing" | "ready"; label: string; next: string; nextLabel: string }[] = [
  { key: "placed", label: "New", next: "accept", nextLabel: "Accept" },
  { key: "accepted", label: "Accepted", next: "prepare", nextLabel: "Start preparing" },
  { key: "preparing", label: "Preparing", next: "ready", nextLabel: "Mark ready" },
  { key: "ready", label: "Ready", next: "deliver", nextLabel: "Delivered" },
];

export default function DeskOrders({
  setToast,
  onChanged,
  readOnly,
}: {
  setToast: (message: string) => void;
  onChanged: () => Promise<void>;
  readOnly: boolean;
}) {
  const [board, setBoard] = useState<Record<string, Order[]>>({});
  const [history, setHistory] = useState<Order[]>([]);
  const [totals, setTotals] = useState({ live: 0, revenueToday: 0, voids: 0 });
  const [busy, setBusy] = useState(false);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [menuImages, setMenuImages] = useState<Record<string, string>>({});
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(false);
  const seenPreorders = useRef<string[] | null>(null);

  const load = useCallback(async () => {
    const data = await api<{
      board: Record<string, Order[]>;
      history: Order[];
      totals: { live: number; revenueToday: number; voids: number };
    }>("/api/desk/orders");
    const preorderIds = (data.board.preorders ?? []).map((order) => order.id);
    if (seenPreorders.current && soundEnabledRef.current && preorderIds.some((id) => !seenPreorders.current?.includes(id))) {
      const context = audioContext.current;
      if (context?.state === "running") {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 880;
        gain.gain.value = 0.08;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.2);
      }
    }
    seenPreorders.current = preorderIds;
    setBoard(data.board);
    setHistory(data.history);
    setTotals(data.totals);
  }, []);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => {
      void load().catch((error) => setToast(error instanceof Error ? error.message : "Could not refresh orders."));
    }, 20_000);
    return () => window.clearInterval(refresh);
  }, [load, setToast]);

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  useEffect(() => {
    let active = true;
    void api<{ items: MenuImage[] }>("/api/desk/menu")
      .then((data) => {
        if (!active) return;
        setMenuImages(Object.fromEntries(data.items.map((item) => [item.name.trim().toLowerCase(), item.imageUrl])));
      })
      .catch((error) => {
        if (active) setToast(error instanceof Error ? `Meal photos could not be loaded: ${error.message}` : "Meal photos could not be loaded.");
      });
    return () => { active = false; };
  }, [setToast]);

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

  const act = (order: Order, action: string, label: string) =>
    run(label, () => api("/api/desk/orders", { method: "PATCH", body: JSON.stringify({ orderId: order.id, action }) }));

  const toggleSound = async () => {
    if (soundEnabled) {
      setSoundEnabled(false);
      return;
    }
    try {
      const context = new AudioContext();
      await context.resume();
      audioContext.current = context;
      setSoundEnabled(true);
    } catch (error) {
      console.error("Could not enable pre-order sound", error);
      setToast("This browser could not enable order sounds.");
    }
  };

  return (
    <div className="space-y-4">
      <section className="desk-orders-heading">
        <div>
          <span className="desk-orders-eyebrow"><UtensilsCrossed size={14} /> RESTAURANT SERVICE</span>
          <h2>Order board</h2>
          <p>Track every meal from guest request to delivery.</p>
        </div>
        <div className="desk-orders-summary">
          <span><strong>{totals.live}</strong> live orders</span>
          <span><strong>{money(totals.revenueToday)}</strong> ordered today</span>
          <span><strong>{totals.voids}</strong> voided lines</span>
          <button type="button" className={BTN} onClick={() => void toggleSound()}>{soundEnabled ? "Sound on" : "Enable sound"}</button>
        </div>
        <div className="desk-orders-wait-note"><Timer size={13} /> Orders waiting over 20 minutes are highlighted.</div>
      </section>
      {(board.preorders ?? []).length > 0 && (
        <section className={`${CARD} border border-amber-400/40 bg-amber-950/20`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-bold text-amber-100">Late-arrival pre-orders</h3><p className="text-xs text-white/60">Confirm these takeaway orders before the guest arrives.</p></div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {(board.preorders ?? []).map((order) => (
              <article key={order.id} className="rounded-xl border border-amber-400/30 bg-black/20 p-3 text-sm text-white">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><strong>{order.orderNumber} · {order.guestName ?? "Guest"}</strong><p className="text-xs text-white/70">{order.guestPhone ?? "No phone provided"} · {order.waitingMinutes} min ago</p></div>
                  <span className="rounded-full bg-amber-400/20 px-2 py-1 text-xs font-bold text-amber-200">PRE-ORDER · LATE ARRIVAL</span>
                </div>
                <ul className="my-2 text-xs text-white/80">{order.items.map((line) => <li key={line.id}>{line.qty}× {line.name} · {money(line.amount)}</li>)}</ul>
                {order.note && <p className="text-xs text-white/65">Note: {order.note}</p>}
                <p className="mt-2 font-bold">{money(order.total)}</p>
                {!readOnly && <div className="mt-3 flex gap-2"><button className={BTN_PRIMARY} disabled={busy} onClick={() => act(order, "accept", `${order.orderNumber}: pre-order confirmed.`)}>Confirm pre-order</button><button className={BTN_DANGER} disabled={busy} onClick={() => setRejectFor(order.id)}>Reject</button></div>}
                {rejectFor === order.id && <div className="mt-2 space-y-2"><input className={INPUT} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason shown to guest" /><div className="flex gap-2"><button className={BTN_DANGER} disabled={busy || !reason.trim()} onClick={() => run("Pre-order rejected.", async () => { await api("/api/desk/orders", { method: "PATCH", body: JSON.stringify({ orderId: order.id, action: "reject", reason }) }); setRejectFor(null); setReason(""); })}>Confirm rejection</button><button className={BTN} onClick={() => setRejectFor(null)}>Cancel</button></div></div>}
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="desk-order-board grid gap-3 lg:grid-cols-4">
        {COLUMNS.map((column) => (
          <div key={column.key} className={CARD}>
            <h3 className={`desk-order-column-heading desk-order-column-${column.key} mb-2 text-xs font-bold uppercase tracking-wide text-white/60`}>
              <span>{column.label}</span>
              <span className="desk-order-column-count">{board[column.key]?.length ?? 0}</span>
            </h3>
            <div className="space-y-2">
              {(board[column.key] ?? []).length === 0 && (
                <p className="desk-order-empty">No {column.label.toLowerCase()} orders right now.</p>
              )}
              {(board[column.key] ?? []).map((order) => (
                <div
                  key={order.id}
                  className={`desk-order-card rounded border p-2.5 text-xs ${
                    order.overdue ? "border-rose-500/50 bg-rose-500/10" : "border-white/10 bg-black/20"
                  }`}
                >
                  <div className="desk-order-card-heading flex items-start justify-between gap-2">
                    <div>
                      <p className="desk-order-number font-bold">
                        <span>{order.orderNumber}</span>
                        <span className="desk-order-destination">{order.roomNumber ? `Room ${order.roomNumber}` : "Counter"}</span>
                      </p>
                      <p className="desk-order-guest text-[11px] text-white/60">
                        {order.guestName ?? "Guest"} <span>·</span> {order.service === "takeaway" ? "Takeaway" : "Room service"}
                      </p>
                    </div>
                    <span className={`desk-order-wait ${order.overdue ? "is-overdue" : ""}`}>
                      <Timer size={11} /> {order.waitingMinutes} min
                    </span>
                  </div>
                  <ul className="desk-order-lines">
                    {order.items.map((line) => {
                      const imageUrl = menuImages[line.name.trim().toLowerCase()];
                      return (
                        <li key={line.id} className={`desk-order-line ${line.status === "voided" ? "is-voided" : ""}`}>
                          {imageUrl ? (
                            <img src={imageUrl} alt="" loading="lazy" />
                          ) : (
                            <span className="desk-order-line-placeholder" aria-hidden="true"><UtensilsCrossed size={14} /></span>
                          )}
                          <span className="desk-order-line-copy">
                            <strong>{line.qty}× {line.name}</strong>
                            <small>{money(line.unitPrice)} each</small>
                          </span>
                          <strong className="desk-order-line-total">{money(line.amount)}</strong>
                        </li>
                      );
                    })}
                  </ul>
                  {order.note && <p className="desk-order-note"><strong>Guest note</strong>{order.note}</p>}
                  <p className="desk-order-total mt-1 text-[11px] font-bold"><span>Order total</span><strong>{money(order.total)}</strong></p>
                  {!readOnly && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        className={BTN_PRIMARY}
                        disabled={busy}
                        onClick={() => act(order, column.next, `${order.orderNumber}: ${column.nextLabel}.`)}
                      >
                        {busy ? <Loader2 size={12} className="animate-spin" /> : null} {column.nextLabel}
                      </button>
                      <button className={BTN_DANGER} disabled={busy} onClick={() => setRejectFor(order.id)}>
                        Reject
                      </button>
                    </div>
                  )}
                  {rejectFor === order.id && (
                    <div className="mt-2 space-y-1">
                      <input
                        className={INPUT}
                        placeholder="Why is it rejected? (the guest sees this)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <div className="flex gap-1.5">
                        <button
                          className={BTN_DANGER}
                          disabled={busy || !reason.trim()}
                          onClick={() =>
                            run("Order rejected — the guest is told why and its folio lines were voided.", async () => {
                              await api("/api/desk/orders", {
                                method: "PATCH",
                                body: JSON.stringify({ orderId: order.id, action: "reject", reason }),
                              });
                              setRejectFor(null);
                              setReason("");
                            })
                          }
                        >
                          Confirm rejection
                        </button>
                        <button className={BTN} onClick={() => setRejectFor(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className={`${CARD} desk-order-history`}>
        <div className="desk-order-history-heading">
          <div>
            <h3>Recent order history</h3>
            <p>Delivered and rejected orders</p>
          </div>
          <span>{Math.min(history.length, 25)} of {history.length}</span>
        </div>
        <div className="desk-order-history-list">
          {history.length === 0 && <p className="desk-order-empty">Completed orders will appear here.</p>}
          {history.slice(0, 25).map((order) => (
            <div key={order.id} className="desk-order-history-row">
              <div className="desk-order-history-main">
                <strong>{order.orderNumber}</strong>
                <span>{order.roomNumber ? `Room ${order.roomNumber}` : "Counter"} · {order.guestName ?? "Guest"}</span>
                <small>{order.items.length} {order.items.length === 1 ? "item" : "items"}</small>
              </div>
              <div className="desk-order-history-result">
                <span className={`desk-order-history-status ${order.status === "rejected" ? "is-rejected" : "is-delivered"}`}>
                  {ORDER_STATUS_LABEL[order.status] ?? order.status}
                </span>
                <strong>{money(order.total)}</strong>
              </div>
              {order.rejectedReason && <p className="desk-order-history-reason">Reason: {order.rejectedReason}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
