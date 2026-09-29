"use client";

import { Loader2, Timer, UtensilsCrossed } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, BTN, BTN_DANGER, BTN_PRIMARY, CARD, INPUT, money, ORDER_STATUS_LABEL } from "./shared";

type OrderLine = { id: string; name: string; qty: number; unitPrice: number; amount: number; status: string };
type Order = {
  id: string;
  orderNumber: string;
  roomNumber: string | null;
  guestName: string | null;
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

  const load = useCallback(async () => {
    const data = await api<{
      board: Record<string, Order[]>;
      history: Order[];
      totals: { live: number; revenueToday: number; voids: number };
    }>("/api/desk/orders");
    setBoard(data.board);
    setHistory(data.history);
    setTotals(data.totals);
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

  const act = (order: Order, action: string, label: string) =>
    run(label, () => api("/api/desk/orders", { method: "PATCH", body: JSON.stringify({ orderId: order.id, action }) }));

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <UtensilsCrossed size={16} className="text-[#f8c66b]" /> Order board
        </h2>
        <span className="text-[11px] text-white/50">
          {totals.live} live · {money(totals.revenueToday)} ordered today · {totals.voids} voided lines
        </span>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-white/50">
          <Timer size={12} /> anything over 20 minutes is highlighted
        </span>
      </section>
      <section className="grid gap-3 lg:grid-cols-4">
        {COLUMNS.map((column) => (
          <div key={column.key} className={CARD}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/60">
              {column.label} ({board[column.key]?.length ?? 0})
            </h3>
            <div className="space-y-2">
              {(board[column.key] ?? []).length === 0 && <p className="text-[11px] text-white/40">Nothing here.</p>}
              {(board[column.key] ?? []).map((order) => (
                <div
                  key={order.id}
                  className={`rounded border p-2.5 text-xs ${
                    order.overdue ? "border-rose-500/50 bg-rose-500/10" : "border-white/10 bg-black/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">
                        {order.roomNumber ? `Room ${order.roomNumber}` : "Counter"} · {order.orderNumber}
                      </p>
                      <p className="text-[11px] text-white/60">
                        {order.guestName ?? "Guest"} · {order.service === "takeaway" ? "takeaway" : "to the room"}
                      </p>
                    </div>
                    <span className={`text-[11px] font-bold ${order.overdue ? "text-rose-200" : "text-white/50"}`}>
                      {order.waitingMinutes} min
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-[11px] text-white/75">
                    {order.items.map((line) => (
                      <li key={line.id} className={line.status === "voided" ? "line-through opacity-50" : ""}>
                        {line.qty}× {line.name} — {money(line.amount)}
                      </li>
                    ))}
                  </ul>
                  {order.note && <p className="mt-1 text-[11px] text-[#f8c66b]">Note: {order.note}</p>}
                  <p className="mt-1 text-[11px] font-bold">Total {money(order.total)}</p>
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

      <section className={CARD}>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/60">
          History (delivered &amp; rejected)
        </h3>
        <div className="space-y-1">
          {history.length === 0 && <p className="text-[11px] text-white/40">No closed orders yet.</p>}
          {history.slice(0, 25).map((order) => (
            <div
              key={order.id}
              className="flex flex-wrap items-center justify-between border-b border-white/5 py-1.5 text-[11px]"
            >
              <span>
                {order.roomNumber ? `Room ${order.roomNumber}` : "Counter"} · {order.orderNumber} · {order.guestName}
              </span>
              <span className="text-white/60">
                {ORDER_STATUS_LABEL[order.status] ?? order.status} · {money(order.total)}
                {order.rejectedReason ? ` · ${order.rejectedReason}` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
