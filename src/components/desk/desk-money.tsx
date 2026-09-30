"use client";

import { CreditCard, Loader2, Receipt } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, BTN, BTN_DANGER, BTN_PRIMARY, CARD, INPUT, money } from "./shared";

type Payment = {
  id: string;
  amount: number;
  channel: string;
  txnRef: string | null;
  payerName: string | null;
  payerPhone: string | null;
  status: string;
  note: string | null;
  rejectedReason: string | null;
  verifiedByLabel: string | null;
  createdAt: string;
  booking: {
    reference: string;
    guestName: string;
    totalAmount: number;
    amountPaid: number;
    status: string;
    checkIn: string;
  } | null;
};

type BillItem = {
  id: string;
  category: string;
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
  status: string;
  voidReason: string | null;
  postedByLabel: string | null;
  createdAt: string;
};

type Bill = {
  bookingId: string;
  reference: string;
  guestName: string;
  roomNumber: string | null;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  amountPaid: number;
  balanceDue: number;
  invoice: { invoiceNumber: string; status: string; totalAmount: number; balanceDue: number } | null;
  items: BillItem[];
  totals: { total: number; openCount: number };
};

export default function DeskMoney({
  setToast,
  onChanged,
  readOnly,
  isAdmin,
}: {
  setToast: (message: string) => void;
  onChanged: () => Promise<void>;
  readOnly: boolean;
  /** ADDENDUM (authority matrix): verifying, rejecting, voiding, charging and regenerating are admin only. */
  isAdmin: boolean;
}) {
  const [queue, setQueue] = useState<Payment[]>([]);
  const [ledger, setLedger] = useState<Payment[]>([]);
  const [totals, setTotals] = useState({
    queueCount: 0,
    queueAmount: 0,
    verifiedAmount: 0,
    rejectedCount: 0,
    byChannel: {} as Record<string, number>,
  });
  const [bills, setBills] = useState<Bill[]>([]);
  const [invoices, setInvoices] = useState<
    { id: string; invoiceNumber: string; bookingRef: string; guestName: string; totalAmount: number; balanceDue: number; status: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [cash, setCash] = useState({ bookingId: "", amount: "", channel: "cash", txnRef: "" });
  const [charge, setCharge] = useState({ bookingId: "", category: "extras", description: "", qty: "1", unitPrice: "" });
  const [openBill, setOpenBill] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [payments, folios] = await Promise.all([
      api<{
        queue: Payment[];
        ledger: Payment[];
        totals: { queueCount: number; queueAmount: number; verifiedAmount: number; rejectedCount: number; byChannel: Record<string, number> };
      }>("/api/desk/payments"),
      api<{
        bills: Bill[];
        invoices: { id: string; invoiceNumber: string; bookingRef: string; guestName: string; totalAmount: number; balanceDue: number; status: string }[];
      }>("/api/desk/folios"),
    ]);
    setQueue(payments.queue);
    setLedger(payments.ledger);
    setTotals(payments.totals);
    setBills(folios.bills);
    setInvoices(folios.invoices);
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

  const paymentAction = (id: string, action: string, extra: Record<string, unknown> = {}, label = "Payment updated.") =>
    run(label, () => api("/api/desk/payments", { method: "POST", body: JSON.stringify({ paymentId: id, action, ...extra }) }));
  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <CreditCard size={16} className="text-[#f8c66b]" /> Payments &amp; folios
        </h2>
        <span className="text-[11px] text-white/50">
          {totals.queueCount} to verify ({money(totals.queueAmount)}) · {money(totals.verifiedAmount)} verified ·{" "}
          {totals.rejectedCount} rejected
        </span>
        <span className="ml-auto text-[11px] text-white/50">
          {Object.entries(totals.byChannel)
            .map(([channel, amount]) => `${channel}: ${money(amount)}`)
            .join(" · ") || "no verified payments yet"}
        </span>
      </section>
      <section className={CARD}>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/60">Payments to verify</h3>
        <div className="space-y-2">
          {queue.length === 0 && <p className="text-[11px] text-white/40">The queue is clear.</p>}
          {queue.map((payment) => (
            <div key={payment.id} className="rounded border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">
                    {money(payment.amount)} · {payment.channel.replace("_", " ")}
                    {payment.txnRef ? ` · ref ${payment.txnRef}` : ""}
                  </p>
                  <p className="text-[11px] text-white/70">
                    {payment.booking ? `${payment.booking.reference} · ${payment.booking.guestName}` : "unlinked"} ·{" "}
                    {payment.payerName ?? "—"} {payment.payerPhone ? `· ${payment.payerPhone}` : ""}
                  </p>
                  {payment.booking && (
                    <p className="text-[11px] text-white/55">
                      booking total {money(payment.booking.totalAmount)} · paid {money(payment.booking.amountPaid)}
                    </p>
                  )}
                </div>
                {!readOnly && isAdmin && (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      className={BTN_PRIMARY}
                      disabled={busy}
                      onClick={() =>
                        paymentAction(
                          payment.id,
                          "verify",
                          {},
                          "Payment verified — the booking updated and may have auto-confirmed.",
                        )
                      }
                    >
                      Verify
                    </button>
                    <button className={BTN_DANGER} disabled={busy} onClick={() => setRejectFor(payment.id)}>
                      Reject
                    </button>
                  </div>
                )}
                {!readOnly && !isAdmin && (
                  <p className="text-[10px] text-white/45">Admin verifies and rejects claims — escalate it at the desk.</p>
                )}
              </div>
              {rejectFor === payment.id && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    className={`${INPUT} max-w-[320px]`}
                    placeholder="why is it rejected? (recorded)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <button
                    className={BTN_DANGER}
                    disabled={busy || !reason.trim()}
                    onClick={async () => {
                      await paymentAction(payment.id, "reject", { reason }, "Payment claim rejected.");
                      setRejectFor(null);
                      setReason("");
                    }}
                  >
                    Confirm rejection
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      {!readOnly && (
        <section className={CARD}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/60">
            Record money received at the desk (cash is already verified)
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={`${INPUT} max-w-[320px]`}
              value={cash.bookingId}
              onChange={(e) => setCash({ ...cash, bookingId: e.target.value })}
            >
              <option value="">Choose a booking…</option>
              {bills.map((bill) => (
                <option key={bill.bookingId} value={bill.bookingId}>
                  {bill.reference} · {bill.guestName} · balance {money(bill.balanceDue)}
                </option>
              ))}
            </select>
            <input
              className={`${INPUT} max-w-[130px]`}
              placeholder="amount"
              value={cash.amount}
              onChange={(e) => setCash({ ...cash, amount: e.target.value })}
            />
            <select
              className={`${INPUT} max-w-[160px]`}
              value={cash.channel}
              onChange={(e) => setCash({ ...cash, channel: e.target.value })}
            >
              <option value="cash">Cash</option>
              <option value="m_pesa">M-Pesa</option>
              <option value="airtel_money">Airtel Money</option>
              <option value="tnm_mpamba">TNM Mpamba</option>
              <option value="bank">Bank transfer</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
            <input
              className={`${INPUT} max-w-[170px]`}
              placeholder="txn ref (optional)"
              value={cash.txnRef}
              onChange={(e) => setCash({ ...cash, txnRef: e.target.value })}
            />
            <button
              className={BTN_PRIMARY}
              disabled={busy || !cash.bookingId || !cash.amount}
              onClick={() =>
                run("Payment recorded and the booking updated.", async () => {
                  await api("/api/desk/payments", {
                    method: "POST",
                    body: JSON.stringify({ action: "record_cash", ...cash, amount: Number(cash.amount) }),
                  });
                  setCash({ bookingId: "", amount: "", channel: "cash", txnRef: "" });
                })
              }
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : null} Record
            </button>
          </div>
        </section>
      )}
      <section className={CARD}>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-white/60">
          <Receipt size={14} /> Open room bills (folios)
        </h3>
        <div className="space-y-2">
          {bills.length === 0 && <p className="text-[11px] text-white/40">No open room bills.</p>}
          {bills.map((bill) => (
            <div key={bill.bookingId} className="rounded border border-white/10 bg-black/20 p-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">
                    {bill.roomNumber ? `Room ${bill.roomNumber}` : "No room"} · {bill.guestName} · {bill.reference}
                  </p>
                  <p className="text-[11px] text-white/60">
                    {bill.checkIn} → {bill.checkOut} · status {bill.status.replace("_", " ")} · bill{" "}
                    {money(bill.totals.total)} · paid {money(bill.amountPaid)} · balance {money(bill.balanceDue)}
                    {bill.invoice ? ` · ${bill.invoice.invoiceNumber} (${bill.invoice.status})` : " · no invoice yet"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button className={BTN} onClick={() => setOpenBill(openBill === bill.bookingId ? null : bill.bookingId)}>
                    {openBill === bill.bookingId ? "Hide lines" : `Show ${bill.totals.openCount} lines`}
                  </button>
                  <a className={BTN} href={`/api/invoices/${bill.reference}`} target="_blank" rel="noreferrer">
                    Invoice PDF
                  </a>
                  {!readOnly && isAdmin && (
                    <button
                      className={BTN}
                      disabled={busy}
                      onClick={() =>
                        run("Invoice regenerated from the folio.", () =>
                          api("/api/desk/folios", {
                            method: "POST",
                            body: JSON.stringify({ action: "regenerate_invoice", bookingId: bill.bookingId }),
                          }),
                        )
                      }
                    >
                      Regenerate invoice
                    </button>
                  )}
                </div>
              </div>

              {openBill === bill.bookingId && (
                <table className="mt-2 w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-white/45">
                      <th className="py-1">Line</th>
                      <th>Category</th>
                      <th className="text-right">Amount</th>
                      <th>Status</th>
                      {!readOnly && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {bill.items.map((item) => (
                      <tr key={item.id} className="border-t border-white/5">
                        <td className="py-1">
                          {item.description}
                          {item.qty > 1 ? ` ×${item.qty}` : ""}
                          {item.voidReason ? ` (void: ${item.voidReason})` : ""}
                        </td>
                        <td>{item.category.replace("_", " ")}</td>
                        <td className="text-right">{money(item.amount)}</td>
                        <td>{item.status}</td>
                        {!readOnly && isAdmin && (
                          <td className="text-right">
                            {item.status === "open" && (
                              <button
                                className={BTN_DANGER}
                                disabled={busy}
                                onClick={() => {
                                  const why = window.prompt(`Why void "${item.description}"? (recorded in the audit log)`);
                                  if (!why?.trim()) return;
                                  void run("Line voided with the reason recorded.", () =>
                                    api("/api/desk/folios", {
                                      method: "POST",
                                      body: JSON.stringify({ action: "void_item", itemId: item.id, reason: why }),
                                    }),
                                  );
                                }}
                              >
                                Void
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      </section>
      {!readOnly && isAdmin && (
        <section className={CARD}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/60">
            Post a charge to a room bill (extras, late check-out, damage)
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={`${INPUT} max-w-[300px]`}
              value={charge.bookingId}
              onChange={(e) => setCharge({ ...charge, bookingId: e.target.value })}
            >
              <option value="">Choose a booking…</option>
              {bills.map((bill) => (
                <option key={bill.bookingId} value={bill.bookingId}>
                  {bill.reference} · {bill.guestName}
                </option>
              ))}
            </select>
            <select
              className={`${INPUT} max-w-[180px]`}
              value={charge.category}
              onChange={(e) => setCharge({ ...charge, category: e.target.value })}
            >
              <option value="extras">extras</option>
              <option value="late_checkout">late check-out</option>
              <option value="damage">damage</option>
              <option value="adjustment">adjustment</option>
            </select>
            <input
              className={`${INPUT} max-w-[240px]`}
              placeholder="description (e.g. Airport transfer)"
              value={charge.description}
              onChange={(e) => setCharge({ ...charge, description: e.target.value })}
            />
            <input
              className={`${INPUT} max-w-[80px]`}
              placeholder="qty"
              value={charge.qty}
              onChange={(e) => setCharge({ ...charge, qty: e.target.value })}
            />
            <input
              className={`${INPUT} max-w-[130px]`}
              placeholder="unit price"
              value={charge.unitPrice}
              onChange={(e) => setCharge({ ...charge, unitPrice: e.target.value })}
            />
            <button
              className={BTN_PRIMARY}
              disabled={busy || !charge.bookingId || !charge.description || !charge.unitPrice}
              onClick={() =>
                run("Charge posted to the room bill.", async () => {
                  const bill = bills.find((b) => b.bookingId === charge.bookingId);
                  await api("/api/desk/folios", {
                    method: "POST",
                    body: JSON.stringify({
                      action: "add_charge",
                      bookingId: charge.bookingId,
                      roomNumber: bill?.roomNumber ?? undefined,
                      category: charge.category,
                      description: charge.description,
                      qty: Number(charge.qty) || 1,
                      unitPrice: Number(charge.unitPrice) || 0,
                    }),
                  });
                  setCharge({ bookingId: "", category: "extras", description: "", qty: "1", unitPrice: "" });
                })
              }
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : null} Post charge
            </button>
          </div>
        </section>
      )}

      <section className={CARD}>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/60">Invoices (never deleted)</h3>
        <div className="space-y-1">
          {invoices.length === 0 && <p className="text-[11px] text-white/40">No invoices issued yet.</p>}
          {invoices.slice(0, 25).map((invoice) => (
            <div
              key={invoice.id}
              className="flex flex-wrap items-center justify-between border-b border-white/5 py-1.5 text-[11px]"
            >
              <span>
                {invoice.invoiceNumber} · {invoice.bookingRef} · {invoice.guestName}
              </span>
              <span className="text-white/60">
                {money(invoice.totalAmount)} · balance {money(invoice.balanceDue)} · {invoice.status} ·{" "}
                <a className="underline" href={`/api/invoices/${invoice.bookingRef}`} target="_blank" rel="noreferrer">
                  PDF
                </a>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className={CARD}>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/60">Ledger (verified &amp; rejected)</h3>
        <div className="space-y-1">
          {ledger.length === 0 && <p className="text-[11px] text-white/40">Nothing recorded yet.</p>}
          {ledger.slice(0, 20).map((payment) => (
            <div
              key={payment.id}
              className="flex flex-wrap items-center justify-between border-b border-white/5 py-1.5 text-[11px]"
            >
              <span>
                {money(payment.amount)} · {payment.channel.replace("_", " ")} ·{" "}
                {payment.booking ? `${payment.booking.reference} · ${payment.booking.guestName}` : "unlinked"}
              </span>
              <span className="text-white/60">
                {payment.status}
                {payment.verifiedByLabel ? ` by ${payment.verifiedByLabel}` : ""}
                {payment.rejectedReason ? ` · ${payment.rejectedReason}` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
