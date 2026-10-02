"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Calendar, Loader2, RefreshCw, Shield, Wallet } from "lucide-react";
import { AdminPageFrame } from "@/components/admin/admin-navigation";

/**
 * GUEST 360 — one person's whole history with the motel, on one page.
 *
 * The tabs answer the questions in the order a desk actually asks them: what did they
 * stay in, what do they owe, what did they pay, what did they spend with the kitchen,
 * and what has the motel recorded. Bookings made before the one-email-one-profile rule
 * are shown with a marker rather than hidden, because those are often the very stays
 * somebody is trying to find.
 */

type Guest = { id: string; fullName: string; email: string | null; phone: string | null; country: string | null; notes: string | null; isRegular: boolean; isNoShow: boolean; marketingConsent: boolean; createdAt: string };
type Booking = { id: string; reference: string; bookingNumber: string | null; roomType: string; checkIn: string; checkOut: string; nights: number; status: string; totalAmount: number; amountPaid: number | null; linked: boolean };
type Invoice = { id: string; invoiceNumber: string; status: string; totalAmount: number; amountPaid: number | null; balanceDue: number | null; taxAmount: number | null; createdAt: string };
type Payment = { id: string; reference: string | null; amount: number; channel: string; txnRef: string | null; status: string; createdAt: string };
type Order = { id: string; orderNumber: string; status: string; total: number; roomNumber: string | null; createdAt: string };
type AuditRow = { action: string; summary: string | null; createdAt: string; actorLabel: string | null };
type Payload = {
  guest?: Guest;
  stats?: { totalBookings: number; totalNights: number; stayCountOnRecord: number; lifetimeSpentOnRecord: number; collectedVerified: number; balanceDue: number; posSpend: number };
  bookings?: Booking[];
  invoices?: Invoice[];
  payments?: Payment[];
  orders?: Order[];
  accounts?: { id: string; status: string; updatedAt: string | null }[];
  audit?: AuditRow[];
  error?: string;
};

const money = (value: number) => `MWK ${Math.round(value || 0).toLocaleString("en-US")}`;
const TABS = ["Bookings", "Invoices", "Payments", "POS orders", "Audit trail", "Notes"] as const;

export default function GuestProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [data, setData] = useState<Payload>({});
  const [tab, setTab] = useState<(typeof TABS)[number]>("Bookings");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    const response = await fetch(`/api/admin/guests/${encodeURIComponent(id)}`, { cache: "no-store" });
    const payload = (await response.json()) as Payload;
    if (!response.ok) throw new Error(payload.error ?? "Could not load that guest.");
    setData(payload);
  }, [id]);

  // Fetched inside an async task so the state updates always happen *after* an await —
  // on the first render `params` can still be empty, and a synchronous setState there
  // would render twice for nothing.
  useEffect(() => {
    if (!id) return;
    let active = true;
    const run = async () => {
      try {
        const response = await fetch(`/api/admin/guests/${encodeURIComponent(id)}`, { cache: "no-store" });
        const payload = (await response.json()) as Payload;
        if (!response.ok) throw new Error(payload.error ?? "Could not load that guest.");
        if (active) setData(payload);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load that guest.");
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [id]);

  const guest = data.guest;
  const stats = data.stats;

  return (
    <AdminPageFrame>
    <div className="sunrise-app-root">
      <main className="manager-tool-page" style={{ maxWidth: 900, margin: "0 auto", padding: "32px 16px 96px" }}>
        <span className="eyebrow"><span className="eyebrow-line" /> GUEST 360</span>
        <h1 className="hero-headline" style={{ marginTop: 8 }}>{guest?.fullName ?? "Guest"}</h1>
        <p className="hero-description">
          {guest?.email ?? "no email on record"} · {guest?.phone ?? "no phone"} · {guest?.country ?? "country not recorded"}
          {guest?.isRegular ? " · regular guest" : ""}{guest?.isNoShow ? " · flagged no-show" : ""}
          {guest ? ` · first seen ${new Date(guest.createdAt).toLocaleDateString()}` : ""}
        </p>

        {error ? <div className="booking-error-banner" style={{ marginTop: 16 }}><Shield size={14} /><span>{error}</span></div> : null}

        <div className="form-grid-2" style={{ marginTop: 20 }}>
          <div className="manager-kpi-card" style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 16, background: "rgba(255,255,255,0.6)" }}>
            <Calendar size={16} />
            <div style={{ fontSize: 12, letterSpacing: 1, opacity: 0.7, marginTop: 8 }}>STAYS</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{stats?.totalBookings ?? 0}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{stats?.totalNights ?? 0} nights · {stats?.stayCountOnRecord ?? 0} completed on record</div>
          </div>
          <div className="manager-kpi-card" style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 16, background: "rgba(255,255,255,0.6)" }}>
            <Wallet size={16} />
            <div style={{ fontSize: 12, letterSpacing: 1, opacity: 0.7, marginTop: 8 }}>BALANCE DUE</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{money(stats?.balanceDue ?? 0)}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{money(stats?.collectedVerified ?? 0)} collected · {money(stats?.posSpend ?? 0)} with the kitchen</div>
          </div>
        </div>

        <div className="section-toolbar" style={{ marginTop: 24 }}>
          <div className="toolbar-info"><h2>History</h2><p>Stays, money, orders and what the system recorded.</p></div>
          <button className="admin-btn" type="button" disabled={busy} onClick={() => { setBusy(true); void load().finally(() => setBusy(false)); }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
          </button>
        </div>
        <div className="invoice-actions" style={{ marginBottom: 12, flexWrap: "wrap" }}>
          {TABS.map((name) => (
            <button key={name} type="button" style={{ opacity: name === tab ? 1 : 0.55 }} className="btn-action" onClick={() => setTab(name)}>
              {name}
            </button>
          ))}
        </div>

        <div className="invoice-list">
          {tab === "Bookings"
            ? (data.bookings ?? []).map((booking) => (
                <div className="invoice-row" key={booking.id}>
                  <div>
                    <strong>{booking.bookingNumber ?? booking.reference}</strong>
                    <small>{booking.roomType} · {booking.checkIn} → {booking.checkOut} · {booking.nights} night(s){booking.linked ? "" : " · not linked to a profile"}</small>
                  </div>
                  <div><strong>{money(booking.totalAmount)}</strong><small>paid {money(booking.amountPaid ?? 0)} · {booking.status}</small></div>
                </div>
              ))
            : null}

          {tab === "Invoices"
            ? (data.invoices ?? []).map((invoice) => (
                <div className="invoice-row" key={invoice.id}>
                  <div><strong>{invoice.invoiceNumber}</strong><small>{invoice.status} · opened {new Date(invoice.createdAt).toLocaleDateString()}{invoice.taxAmount ? ` · VAT inside ${money(invoice.taxAmount)}` : ""}</small></div>
                  <div><strong>{money(invoice.totalAmount)}</strong><small>paid {money(invoice.amountPaid ?? 0)} · balance {money(invoice.balanceDue ?? 0)}</small></div>
                </div>
              ))
            : null}


          {tab === "Payments"
            ? (data.payments ?? []).map((payment) => (
                <div className="invoice-row" key={payment.id}>
                  <div><strong>{money(payment.amount)}</strong><small>{payment.channel.replace(/_/g, " ")}{payment.txnRef ? ` · ref ${payment.txnRef}` : ""}</small></div>
                  <div><strong>{payment.status.replace(/_/g, " ")}</strong><small>{new Date(payment.createdAt).toLocaleString()}{payment.reference ? ` · ${payment.reference}` : ""}</small></div>
                </div>
              ))
            : null}

          {tab === "POS orders"
            ? (data.orders ?? []).map((order) => (
                <div className="invoice-row" key={order.id}>
                  <div><strong>{order.orderNumber}</strong><small>{order.roomNumber ? `room ${order.roomNumber}` : "walk-in"} · {new Date(order.createdAt).toLocaleString()}</small></div>
                  <div><strong>{money(order.total)}</strong><small>{order.status}</small></div>
                </div>
              ))
            : null}

          {tab === "Audit trail"
            ? (data.audit ?? []).map((row, index) => (
                <div className="invoice-row" key={`${row.action}-${index}`}>
                  <div><strong>{row.action}</strong><small>{row.summary ?? ""}</small></div>
                  <div><small>{new Date(row.createdAt).toLocaleString()}{row.actorLabel ? ` · ${row.actorLabel}` : ""}</small></div>
                </div>
              ))
            : null}

          {tab === "Notes" ? (
            <div className="invoice-row">
              <div>
                <strong>Notes on file</strong>
                <small>{guest?.notes ?? "Nothing recorded yet. The desk can add notes from the guest list."}</small>
              </div>
              <div>
                <small>Marketing consent: {guest?.marketingConsent ? "given" : "not given"}</small>
                <small>{(data.accounts ?? []).length > 0 ? `${(data.accounts ?? []).length} guest login(s) · ${(data.accounts ?? [])[0]?.status ?? ""}` : "No guest login — this person books by email or phone only"}</small>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="admin-foot"><Shield size={13} /> Guest records · visible to managers and admins · every view and change is audited</footer>
      </main>
    </div>
    </AdminPageFrame>
  );
}

