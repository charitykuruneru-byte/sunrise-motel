"use client";

import { CheckCircle2, Download, Loader2, MessageCircle, Search, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { PageFrame } from "@/components/experience-pages";

type TrackResult = {
  booking: {
    reference: string;
    status: string;
    guestName: string;
    roomType: string;
    assignedRoom: string | null;
    checkIn: string;
    checkOut: string;
    nights: number;
    adults: number;
    children: number;
    totalAmount: number;
    amountPaid: number;
    invoiceNumber: string | null;
    invoiceUrl: string;
    createdAt: string;
  };
  events: { action: string; note: string | null; createdAt: string }[];
};

const LABELS: Record<string, string> = {
  created: "Request received",
  status_changed: "Status updated",
  room_assigned: "Room assigned",
  payment_recorded: "Payment recorded",
  invoice_emailed: "Invoice emailed",
  invoice_email_failed: "Invoice email pending",
};

const STATUS_COPY: Record<string, string> = {
  pending: "Our front desk is reviewing your request. You will hear from us on WhatsApp shortly.",
  awaiting_payment: "Your room is held. Please pay the balance using the channels on your invoice and send proof on WhatsApp.",
  confirmed: "Confirmed — we look forward to welcoming you. Check-in is from 14:00.",
  checked_in: "Welcome! You are checked in. Ask the front desk for anything you need.",
  checked_out: "Thank you for staying with us. When you are here, you are family.",
  cancelled: "This booking was cancelled. Contact us if this is unexpected.",
};

const money = (v: number) => `MWK ${Math.round(v).toLocaleString("en-US")}`;

export function TrackBooking() {
  const params = useSearchParams();
  const [reference, setReference] = useState(params.get("ref") ?? "");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TrackResult | null>(null);

  useEffect(() => {
    const ref = params.get("ref");
    if (ref) setReference(ref);
  }, [params]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference, phone }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not find that booking.");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not find that booking.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageFrame active="Track">
      <section className="mobile-hero-section hero-compact">
        <div className="hero-content-wrapper">
          <span className="eyebrow eyebrow-light"><span className="eyebrow-line" /> FOLLOW YOUR BOOKING</span>
          <h1 className="hero-headline">Track your stay. <em>No login needed.</em></h1>
          <p className="hero-description">Enter the reference from your confirmation screen and the phone number you booked with.</p>

          <form className="hero-search-card" onSubmit={submit}>
            <div className="search-fields-grid two-cols">
              <div className="search-field">
                <label>Booking reference</label>
                <input value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} placeholder="SM-260918-AB12" required />
              </div>
              <div className="search-field">
                <label>Phone used at booking</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+265 …" required inputMode="tel" />
              </div>
            </div>
            <button className="btn-submit-booking-request" type="submit" disabled={loading}>{loading ? <><Loader2 size={16} className="spin" /> Looking up…</> : <><Search size={16} /> Find my booking</>}</button>
            {error && <p className="booking-error-banner" style={{ marginTop: 12 }}>{error}</p>}
          </form>
        </div>
      </section>

      {result && (
        <section className="mobile-rooms-section">
          <div className="track-card">
            <div className="track-head">
              <div>
                <span className="eyebrow"><span className="eyebrow-line" /> BOOKING {result.booking.reference}</span>
                <h2>{result.booking.roomType}{result.booking.assignedRoom ? ` · ${result.booking.assignedRoom}` : ""}</h2>
                <p>{result.booking.checkIn} → {result.booking.checkOut} · {result.booking.nights} night{result.booking.nights > 1 ? "s" : ""} · {result.booking.adults} adult{result.booking.adults > 1 ? "s" : ""}{result.booking.children ? ` · ${result.booking.children} child` : ""}</p>
              </div>
              <span className={`status-pill status-${result.booking.status}`}>{result.booking.status.replace("_", " ")}</span>
            </div>
            <p className="track-status-copy"><CheckCircle2 size={16} /> {STATUS_COPY[result.booking.status] ?? "We have your booking on file."}</p>

            <div className="track-money">
              <div><small>Total</small><strong>{money(result.booking.totalAmount)}</strong></div>
              <div><small>Paid</small><strong>{money(result.booking.amountPaid)}</strong></div>
              <div><small>Balance</small><strong className={result.booking.totalAmount - result.booking.amountPaid > 0 ? "due" : "paid"}>{money(Math.max(0, result.booking.totalAmount - result.booking.amountPaid))}</strong></div>
            </div>

            <div className="track-actions">
              <a className="btn-submit-booking-request" href={result.booking.invoiceUrl} download><Download size={16} /> Download {result.booking.amountPaid >= result.booking.totalAmount ? "receipt" : "pro-forma invoice"} (PDF)</a>
              <a className="btn-whatsapp-success" href={`https://wa.me/265998688332?text=${encodeURIComponent(`Hello Sunrise Motel, I am following up on booking ${result.booking.reference}.`)}`} target="_blank" rel="noreferrer"><MessageCircle size={16} /> WhatsApp the front desk</a>
            </div>

            <h3 className="track-timeline-title">Progress</h3>
            <ol className="timeline">
              {result.events.map((ev, i) => (
                <li key={i}>
                  <span className="tl-dot" />
                  <div>
                    <strong>{LABELS[ev.action] ?? ev.action}</strong>
                    {ev.note && <p>{ev.note}</p>}
                    <small>{new Date(ev.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
                  </div>
                </li>
              ))}
            </ol>
            <p className="no-account-guarantee"><ShieldCheck size={14} className="accent-sage" /> Only someone with your reference and phone number can see this page.</p>
          </div>
        </section>
      )}
    </PageFrame>
  );
}
