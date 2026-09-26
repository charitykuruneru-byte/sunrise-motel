"use client";

import {
  AlertCircle,
  ArrowRight,
  BedDouble,
  BriefcaseBusiness,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  Compass,
  Download,
  Layers,
  Loader2,
  MapPin,
  Menu,
  MessageCircle,
  Minus,
  MoveRight,
  Phone,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Utensils,
  Waves,
  Wifi,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import InstallAppPopup from "@/components/InstallAppPopup";
import { GalleryGrid } from "@/components/experience-pages";
import { PageLoadingSplash, SunriseFullLogo, SunriseLogo } from "@/components/sunrise-logo";

type RoomData = {
  id: string;
  name: string;
  slug: string;
  description: string;
  rate: number;
  totalInventory: number;
  bookedCount: number;
  availableCount: number;
  isSoldOut: boolean;
  statusText: string;
  bed: string;
  sleeps: string;
  size: string;
  badge?: string | null;
  features: string[];
  images: string[];
};

type PostData = { id: string; title: string; category: string; day: string | null; date: string | null; time: string | null; detail: string; priceTag: string | null; imageUrl: string | null; isActive: boolean };

const formatMoney = (value: number) => `MWK ${Math.round(value).toLocaleString("en-US")}`;

function getNights(checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut) return 1;
  const start = new Date(`${checkIn}T12:00:00`).getTime();
  const end = new Date(`${checkOut}T12:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

function isoPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const WA = "https://wa.me/265998688332?text=";

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [checkIn, setCheckIn] = useState(isoPlus(1));
  const [checkOut, setCheckOut] = useState(isoPlus(3));
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);

  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [posts, setPosts] = useState<PostData[]>([]);

  const [slideshow, setSlideshow] = useState<{ room: RoomData; index: number } | null>(null);

  const [bookingRoom, setBookingRoom] = useState<RoomData | null>(null);
  const [step, setStep] = useState<"form" | "done">("form");
  const [result, setResult] = useState<{ reference: string; invoiceUrl: string; trackUrl: string; total: number; emailNote: string | null } | null>(null);
  const [bookingError, setBookingError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [breakfastQty, setBreakfastQty] = useState(0);
  const [transfer, setTransfer] = useState(false);
  const [lateCheckout, setLateCheckout] = useState(false);

  const nights = useMemo(() => getNights(checkIn, checkOut), [checkIn, checkOut]);

  const fetchAvailability = async (inDate: string, outDate: string) => {
    setLoadingRooms(true);
    try {
      const res = await fetch(`/api/availability?checkIn=${inDate}&checkOut=${outDate}`);
      const data = await res.json();
      if (data.rooms) setRooms(data.rooms);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    fetchAvailability(checkIn, checkOut);
  }, [checkIn, checkOut]);

  useEffect(() => {
    fetch("/api/admin/posts")
      .then((r) => r.json())
      .then((d) => setPosts((d.posts ?? []).filter((p: PostData) => p.isActive)))
      .catch(() => setPosts([]));
  }, []);

  const extras = useMemo(() => {
    const list: { label: string; amount: number }[] = [];
    if (breakfastQty > 0) list.push({ label: `Daily breakfast × ${breakfastQty} guest${breakfastQty > 1 ? "s" : ""} (${nights} night${nights > 1 ? "s" : ""})`, amount: breakfastQty * 8500 * nights });
    if (transfer) list.push({ label: "Kamuzu Airport transfer (one-way)", amount: 25000 });
    if (lateCheckout) list.push({ label: "Late check-out until 15:00", amount: 15000 });
    return list;
  }, [breakfastQty, transfer, lateCheckout, nights]);
  const extrasTotal = extras.reduce((s, e) => s + e.amount, 0);
  const grandTotal = bookingRoom ? bookingRoom.rate * nights + extrasTotal : 0;
  const totalRoomsFree = rooms.reduce((s, r) => s + r.availableCount, 0);

  const lockScroll = (locked: boolean) => {
    document.body.style.overflow = locked ? "hidden" : "auto";
  };

  const openSlideshow = (room: RoomData) => {
    setSlideshow({ room, index: 0 });
    lockScroll(true);
  };
  const closeSlideshow = () => {
    setSlideshow(null);
    lockScroll(false);
  };
  const moveSlide = (dir: number) => setSlideshow((s) => (s ? { ...s, index: (s.index + dir + s.room.images.length) % s.room.images.length } : s));

  const openBooking = (room: RoomData) => {
    setBookingRoom(room);
    setStep("form");
    setResult(null);
    setBookingError("");
    setBreakfastQty(0);
    setTransfer(false);
    setLateCheckout(false);
    lockScroll(true);
  };
  const closeBooking = () => {
    setBookingRoom(null);
    lockScroll(false);
  };

  const submitBooking = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!bookingRoom) return;
    setSubmitting(true);
    setBookingError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomTypeId: bookingRoom.id,
          checkIn,
          checkOut,
          adults,
          children,
          extras,
          guestName: fd.get("guestName"),
          phone: fd.get("phone"),
          email: fd.get("email"),
          arrival: fd.get("arrival"),
          requests: fd.get("requests"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send your request.");
      setResult({ reference: data.booking.reference, invoiceUrl: data.booking.invoiceUrl, trackUrl: data.booking.trackUrl, total: data.booking.totalAmount, emailNote: data.booking.emailNote ?? null });
      setStep("done");
      fetchAvailability(checkIn, checkOut);
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : "Could not send your request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sunrise-app-root">
      <InstallAppPopup />
      <PageLoadingSplash />

      <div className="mobile-top-utility">
        <div className="utility-container">
          <span className="utility-item"><MapPin size={12} className="accent-orange" /> Area 5, Lilongwe</span>
          <a href="tel:+265998688332" className="utility-link"><Phone size={12} className="accent-orange" /> +265 998 688 332</a>
          <a href="/track" className="utility-admin-pill">Track booking</a>
        </div>
      </div>

      <header className="mobile-main-header">
        <div className="header-inner">
          <a href="/" className="header-logo-link" aria-label="Sunrise Motel home">
            <SunriseLogo size="small" animated theme="dark" />
          </a>
          <nav className={`header-nav-menu ${menuOpen ? "is-visible" : ""}`}>
            <a href="/stay"><BedDouble size={16} /> Stay</a>
            <a href="/dine"><Utensils size={16} /> Dine</a>
            <a href="/unwind"><Waves size={16} /> Unwind</a>
            <a href="/connect"><Wifi size={16} /> Connect</a>
            <a href="/gallery"><Layers size={16} /> Gallery</a>
            <a href="/track"><Search size={16} /> Track booking</a>
            <a href="/admin" className="admin-nav-link"><ShieldCheck size={16} /> Manager portal</a>
          </nav>
          <div className="header-right-actions">
            <a href={`${WA}${encodeURIComponent("Hello Sunrise Motel, I would like to make an enquiry.")}`} target="_blank" rel="noreferrer" className="btn-whatsapp-header"><MessageCircle size={16} /> <span>WhatsApp</span></a>
            <button className="menu-toggle-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu" aria-expanded={menuOpen}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="mobile-hero-section">
        <div className="hero-backdrop" />
        <div className="hero-gradient-overlay" />
        <div className="hero-content-wrapper">
          <div className="hero-badge-pill"><span className="pulsing-sun-dot" /><span>DIRECT BOOKING · NO ACCOUNT · NO PASSWORD</span></div>
          <h1 className="hero-headline">Your warm welcome in the heart of Lilongwe. <em>When you are here, you are family.</em></h1>
          <p className="hero-description">Comfortable rooms, generous local meals, relaxed evenings and dependable Starlink Wi-Fi — Mzimba Road, Area 5.</p>

          <div className="hero-search-card">
            <div className="search-card-header">
              <div className="header-title"><CalendarCheck size={16} className="accent-orange" /><strong>Check live availability</strong></div>
              <span className="live-pill">{loadingRooms ? <Loader2 size={12} className="spin" /> : <span className="live-dot" />} {loadingRooms ? "Checking…" : `${totalRoomsFree} rooms free`}</span>
            </div>
            <div className="search-fields-grid">
              <div className="search-field">
                <label>Check-in</label>
                <div className="input-icon-wrap"><Calendar size={15} /><input type="date" value={checkIn} min={isoPlus(0)} onChange={(e) => { setCheckIn(e.target.value); if (e.target.value >= checkOut) setCheckOut(e.target.value); }} required /></div>
              </div>
              <div className="search-field">
                <label>Check-out</label>
                <div className="input-icon-wrap"><Calendar size={15} /><input type="date" value={checkOut} min={checkIn} onChange={(e) => setCheckOut(e.target.value)} required /></div>
              </div>
              <div className="search-field">
                <label>Guests in your party</label>
                <div className="stepper-box">
                  <button type="button" onClick={() => setAdults(Math.max(1, adults - 1))} aria-label="Fewer guests"><Minus size={14} /></button>
                  <span>{adults} adult{adults > 1 ? "s" : ""}</span>
                  <button type="button" onClick={() => setAdults(Math.min(6, adults + 1))} aria-label="More guests"><Plus size={14} /></button>
                </div>
              </div>
            </div>
            <div className="search-summary-strip">
              <div className="nights-badge"><strong>{nights} night{nights > 1 ? "s" : ""}</strong><small>{checkIn} → {checkOut}</small></div>
              <div className="anti-overbooking-notice"><ShieldCheck size={14} className="text-sage" /><span>Counts come from real bookings — a room is only shown if it is free every night of your stay</span></div>
            </div>
            <a href="#rooms-section" className="btn-submit-booking-request" style={{ marginTop: 12 }}>See available rooms <ArrowRight size={16} /></a>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className="mobile-trust-strip">
        <div className="trust-inner-grid">
          <div className="trust-card"><div className="trust-icon-box"><Wifi size={18} /></div><div><strong>Starlink Wi-Fi</strong><small>Dependable, fast internet</small></div></div>
          <div className="trust-card"><div className="trust-icon-box"><Utensils size={18} /></div><div><strong>Kitchen & bar</strong><small>07:00 — 22:00 daily · room service</small></div></div>
          <div className="trust-card"><div className="trust-icon-box"><CarFront size={18} /></div><div><strong>Secure parking</strong><small>Gated, guarded 24/7</small></div></div>
        </div>
      </section>

      {/* PILLARS */}
      <section className="mobile-pillars-section">
        <div className="section-head">
          <span className="eyebrow"><span className="eyebrow-line" /> FOUR REASONS TO VISIT</span>
          <h2>Stay. Dine. Unwind. Connect.</h2>
          <p>Each has its own page with live details, pictures and a simple form.</p>
        </div>
        <div className="pillars-cards-grid">
          <a href="/stay" className="pillar-link-card pillar-stay"><div className="pillar-top-row"><span className="pillar-num">01</span><span className="pillar-icon"><BedDouble size={22} /></span></div><h3>Stay</h3><p>Sleep well in a room that gives you space to exhale.</p><span className="pillar-cta">Explore rooms <MoveRight size={14} /></span></a>
          <a href="/dine" className="pillar-link-card pillar-dine"><div className="pillar-top-row"><span className="pillar-num">02</span><span className="pillar-icon"><Utensils size={22} /></span></div><h3>Dine</h3><p>Comforting plates, grilled favourites and something cold.</p><span className="pillar-cta">See the menu <MoveRight size={14} /></span></a>
          <a href="/unwind" className="pillar-link-card pillar-unwind"><div className="pillar-top-row"><span className="pillar-num">03</span><span className="pillar-icon"><Waves size={22} /></span></div><h3>Unwind</h3><p>Braai days, happy hours and easy evenings by the pool.</p><span className="pillar-cta">What&apos;s on <MoveRight size={14} /></span></a>
          <a href="/connect" className="pillar-link-card pillar-connect"><div className="pillar-top-row"><span className="pillar-num">04</span><span className="pillar-icon"><BriefcaseBusiness size={22} /></span></div><h3>Connect</h3><p>Coffee, power and a reliable connection when you need focus.</p><span className="pillar-cta">Find your flow <MoveRight size={14} /></span></a>
        </div>
      </section>

      {/* ROOMS */}
      <section id="rooms-section" className="mobile-rooms-section">
        <div className="section-head">
          <span className="eyebrow"><span className="eyebrow-line" /> LIVE ROOM AVAILABILITY</span>
          <h2>Rooms made for real rest</h2>
          <p>Availability below is for <strong>{checkIn} → {checkOut}</strong>. Numbers only drop when a real booking overlaps those nights, so nothing is double-booked.</p>
        </div>

        <div className="rooms-cards-list">
          {rooms.map((room) => (
            <article key={room.id} className={`room-card-structured ${room.isSoldOut ? "card-sold-out" : ""}`}>
              <div className="room-photo-header">
                <img src={room.images[0]} alt={`${room.name} at Sunrise Motel`} />
                <div className="photo-tag-overlay">
                  <span className={`availability-chip ${room.isSoldOut ? "chip-sold-out" : room.availableCount === 1 ? "chip-low" : "chip-available"}`}>{room.statusText}</span>
                  {room.badge && <span className="badge-chip">{room.badge}</span>}
                </div>
                <button className="btn-view-slideshow" onClick={() => openSlideshow(room)}><Layers size={14} /> {room.images.length} photos</button>
              </div>
              <div className="room-card-content">
                <div className="room-title-rate-row">
                  <div><h3>{room.name}</h3><p className="room-desc">{room.description}</p></div>
                  <div className="room-pricing-box"><span className="from-label">Per night</span><strong className="rate-amount">{formatMoney(room.rate)}</strong><small className="stay-calc-hint">{formatMoney(room.rate * nights)} for {nights} night{nights > 1 ? "s" : ""}</small></div>
                </div>
                <div className="room-specs-row"><span><BedDouble size={14} className="accent-orange" /> {room.bed}</span><span><Users size={14} className="accent-orange" /> {room.sleeps}</span><span><Compass size={14} className="accent-orange" /> {room.size}</span></div>
                <div className="availability-meta">
                  <span className={room.isSoldOut ? "meta-bad" : "meta-good"}>{room.isSoldOut ? "No rooms free for these nights" : `${room.availableCount} free`}</span>
                  <span>{room.bookedCount === 0 ? "No other bookings on these dates" : `${room.bookedCount} already booked on these dates`}</span>
                  <span>{room.totalInventory} rooms of this type</span>
                </div>
                <div className="room-features-pills">{room.features.slice(0, 4).map((f) => <span key={f} className="feature-pill"><Check size={12} className="accent-sage" /> {f}</span>)}</div>
                <div className="room-card-actions">
                  <button className="btn-open-slideshow-secondary" onClick={() => openSlideshow(room)}><Layers size={14} /> View photos</button>
                  {room.isSoldOut ? <button className="btn-book-room btn-disabled" disabled>Fully booked</button> : <button className="btn-book-room btn-active-book" onClick={() => openBooking(room)}>Book this room <ArrowRight size={15} /></button>}
                </div>
              </div>
            </article>
          ))}
          {rooms.length === 0 && !loadingRooms && <div className="empty-state"><BedDouble size={30} /><p>Rooms are loading…</p></div>}
        </div>
      </section>

      {/* GALLERY */}
      <section className="mobile-gallery-section">
        <GalleryGrid limit={12} />
      </section>

      {/* POSTS */}
      <section className="mobile-events-section">
        <div className="section-head">
          <span className="eyebrow eyebrow-light"><span className="eyebrow-line" /> THIS WEEK AT SUNRISE</span>
          <h2>Events, specials & offers</h2>
          <p>Published by the team from the manager portal — always current.</p>
        </div>
        <div className="events-cards-grid">
          {posts.map((post) => (
            <div key={post.id} className="event-feature-card">
              {post.imageUrl && <div className="event-card-img"><img src={post.imageUrl} alt={post.title} /><span className="event-cat-tag">{post.category}</span></div>}
              <div className="event-card-body">
                <div className="event-date-block"><small>{post.day || "EVENT"}</small><strong>{post.date || "NOW"}</strong></div>
                <div className="event-details">
                  <h4>{post.title}</h4>
                  <small className="event-time"><Clock3 size={12} /> {post.time || "All day"}</small>
                  <p>{post.detail}</p>
                  {post.priceTag && <span className="event-price-pill">{post.priceTag}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* TRACK BOOKING */}
      <section className="mobile-zip-download-section">
        <div className="zip-card zip-card-track">
          <div className="zip-icon-wrap"><Search size={24} /></div>
          <div className="zip-info"><strong>Already requested a room?</strong><p>Follow your booking, see payments and download your invoice with just your reference and phone number.</p></div>
          <a href="/track" className="btn-download-zip"><Search size={16} /> Track my booking</a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="mobile-site-footer">
        <div className="footer-content">
          <div className="footer-logo-row">
            <SunriseFullLogo className="footer-full-logo" />
            <p className="footer-tagline">Comfortable rooms, generous meals, lively evenings and dependable connectivity — all in Area 5, Lilongwe.</p>
          </div>
          <div className="footer-links-grid">
            <div>
              <strong>EXPLORE</strong>
              <a href="/stay">Rooms & stay</a>
              <a href="/dine">Restaurant & menu</a>
              <a href="/unwind">Events & braai</a>
              <a href="/connect">Work & coffee</a>
              <a href="/gallery">Gallery</a>
              <a href="/track">Track a booking</a>
            </div>
            <div>
              <strong>FIND US</strong>
              <p><MapPin size={13} /> Mzimba Road, behind Bwasila Secondary School, Area 5, Lilongwe, Malawi</p>
              <p><Phone size={13} /> +265 998 688 332</p>
              <a href={`${WA}${encodeURIComponent("Hello Sunrise Motel front desk.")}`} target="_blank" rel="noreferrer"><MessageCircle size={13} /> WhatsApp front desk</a>
              <a href="https://maps.google.com/?q=Sunrise+Motel+Mzimba+Road+Area+5+Lilongwe" target="_blank" rel="noreferrer"><Compass size={13} /> Directions</a>
            </div>
          </div>
          <div className="footer-bottom-bar"><span>© 2026 Sunrise Motel · When you are here, you are family.</span><a href="/admin" className="admin-footer-link">Manager portal</a></div>
        </div>
      </footer>

      <div className="mobile-fixed-bottom-bar">
        <a href="#rooms-section" className="bottom-bar-action active"><CalendarDays size={18} /><span>Book</span></a>
        <a href="/dine" className="bottom-bar-action"><Utensils size={18} /><span>Dine</span></a>
        <a href={`${WA}${encodeURIComponent("Hello Sunrise Motel, I am looking to book a room.")}`} target="_blank" rel="noreferrer" className="bottom-bar-action whatsapp-highlight"><MessageCircle size={18} /><span>WhatsApp</span></a>
        <a href="/track" className="bottom-bar-action"><Search size={18} /><span>Track</span></a>
      </div>

      {/* ROOM SLIDESHOW */}
      {slideshow && (
        <div className="slideshow-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeSlideshow(); }}>
          <div className="slideshow-modal-card">
            <button className="slideshow-close-btn" onClick={closeSlideshow} aria-label="Close slideshow"><X size={20} /></button>
            <div className="slideshow-top-header">
              <div><span className="eyebrow eyebrow-light"><span className="eyebrow-line" /> ROOM PHOTOS</span><h2>{slideshow.room.name}</h2></div>
              <span className="slide-counter">{slideshow.index + 1} of {slideshow.room.images.length}</span>
            </div>
            <div className="slideshow-viewport">
              <img src={slideshow.room.images[slideshow.index]} alt={`${slideshow.room.name} photo ${slideshow.index + 1}`} />
              <button className="slide-nav-btn prev-btn" onClick={() => moveSlide(-1)} aria-label="Previous photo"><ChevronLeft size={24} /></button>
              <button className="slide-nav-btn next-btn" onClick={() => moveSlide(1)} aria-label="Next photo"><ChevronRight size={24} /></button>
            </div>
            <div className="slideshow-thumbnails-row">
              {slideshow.room.images.map((img, i) => <button key={img} className={`thumbnail-btn ${i === slideshow.index ? "active" : ""}`} onClick={() => setSlideshow({ ...slideshow, index: i })}><img src={img} alt="" /></button>)}
            </div>
            <div className="slideshow-specs-footer">
              <div className="specs-info"><strong>{formatMoney(slideshow.room.rate)} / night</strong><small>{slideshow.room.bed} · {slideshow.room.sleeps} · {slideshow.room.size} · {slideshow.room.statusText}</small></div>
              {!slideshow.room.isSoldOut && <button className="btn-book-from-slideshow" onClick={() => { const r = slideshow.room; closeSlideshow(); openBooking(r); }}>Book this room <ArrowRight size={15} /></button>}
            </div>
          </div>
        </div>
      )}

      {/* BOOKING SHEET */}
      {bookingRoom && (
        <div className="booking-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) closeBooking(); }}>
          <div className="booking-modal-sheet">
            <button className="sheet-close-btn" onClick={closeBooking} aria-label="Close"><X size={20} /></button>

            {step === "form" ? (
              <form onSubmit={submitBooking} className="booking-dynamic-form">
                <div className="modal-sheet-header">
                  <span className="eyebrow"><span className="eyebrow-line" /> DIRECT REQUEST · NO ACCOUNT</span>
                  <h2>Request {bookingRoom.name}</h2>
                  <p>{bookingRoom.availableCount} of {bookingRoom.totalInventory} rooms free for your dates. Your room is protected the moment you send this.</p>
                </div>

                <div className="booking-stay-card">
                  <img src={bookingRoom.images[0]} alt="" />
                  <div className="stay-card-info"><strong>{bookingRoom.name}</strong><span>{checkIn} → {checkOut} · {nights} night{nights > 1 ? "s" : ""}</span><small>{adults} adult{adults > 1 ? "s" : ""}{children ? ` · ${children} child` : ""} · {bookingRoom.bed}</small></div>
                  <div className="stay-card-price"><span>Room total</span><strong>{formatMoney(bookingRoom.rate * nights)}</strong></div>
                </div>

                <div className="extras-calculator-box">
                  <div className="extras-header"><Sparkles size={16} className="accent-orange" /><strong>Add extras — the total updates instantly</strong></div>
                  <div className="extra-item-row">
                    <div className="extra-left"><Coffee size={16} className="accent-orange" /><div><strong>Daily breakfast</strong><small>MWK 8,500 per guest per day</small></div></div>
                    <div className="extra-stepper"><button type="button" onClick={() => setBreakfastQty(Math.max(0, breakfastQty - 1))} aria-label="Fewer"><Minus size={13} /></button><span>{breakfastQty}</span><button type="button" onClick={() => setBreakfastQty(Math.min(adults, breakfastQty + 1))} aria-label="More"><Plus size={13} /></button></div>
                  </div>
                  <div className="extra-item-row">
                    <div className="extra-left"><Compass size={16} className="accent-orange" /><div><strong>Kamuzu Airport transfer</strong><small>One-way · MWK 25,000</small></div></div>
                    <label className="switch-toggle"><input type="checkbox" checked={transfer} onChange={(e) => setTransfer(e.target.checked)} /><span className="toggle-slider" /></label>
                  </div>
                  <div className="extra-item-row">
                    <div className="extra-left"><Clock3 size={16} className="accent-orange" /><div><strong>Late check-out (15:00)</strong><small>Subject to availability · MWK 15,000</small></div></div>
                    <label className="switch-toggle"><input type="checkbox" checked={lateCheckout} onChange={(e) => setLateCheckout(e.target.checked)} /><span className="toggle-slider" /></label>
                  </div>
                  <div className="live-calculation-summary">
                    <div className="calc-row"><span>{bookingRoom.name} × {nights} night{nights > 1 ? "s" : ""} @ {formatMoney(bookingRoom.rate)}</span><span>{formatMoney(bookingRoom.rate * nights)}</span></div>
                    {extras.map((x) => <div key={x.label} className="calc-row extras-line"><span>{x.label}</span><span>+{formatMoney(x.amount)}</span></div>)}
                    <div className="calc-row total-line"><strong>Total for this stay</strong><strong>{formatMoney(grandTotal)}</strong></div>
                  </div>
                </div>

                <div className="form-fields-group">
                  <label className="form-input-label"><span>Full name *</span><input name="guestName" required placeholder="e.g. Kondwani Phiri" autoComplete="name" /></label>
                  <div className="form-grid-2">
                    <label className="form-input-label"><span>Phone / WhatsApp *</span><input name="phone" required placeholder="+265 …" autoComplete="tel" inputMode="tel" /></label>
                    <label className="form-input-label"><span>Email (invoice PDF)</span><input name="email" type="email" placeholder="you@example.com" autoComplete="email" /></label>
                  </div>
                  <div className="form-grid-2">
                    <label className="form-input-label"><span>Expected arrival</span><select name="arrival" defaultValue=""><option value="">Choose a time</option><option>Morning (before 14:00)</option><option>Afternoon (14:00 — 18:00)</option><option>Evening (18:00 — 22:00)</option><option>Late night (after 22:00)</option></select></label>
                    <label className="form-input-label"><span>Requests</span><input name="requests" placeholder="Quiet room, ground floor…" /></label>
                  </div>
                </div>

                {bookingError && <div className="booking-error-banner"><AlertCircle size={16} /><span>{bookingError}</span></div>}

                <button type="submit" className="btn-submit-booking-request" disabled={submitting}>{submitting ? <><Loader2 size={18} className="spin" /> Protecting your room & issuing pro-forma…</> : <>Send booking request · {formatMoney(grandTotal)} <Send size={16} /></>}</button>
                <p className="no-account-guarantee"><ShieldCheck size={14} className="accent-sage" /> Saved first, then the front desk is alerted. You get a reference, a PDF pro-forma and a tracking link.</p>
              </form>
            ) : (
              result && (
                <div className="booking-success-view">
                  <div className="success-icon-bubble"><CheckCircle2 size={44} /></div>
                  <span className="eyebrow"><span className="eyebrow-line" /> REQUEST RECEIVED</span>
                  <h2>Your room is held.</h2>
                  <p>We have your request for <strong>{bookingRoom.name}</strong>, {checkIn} → {checkOut}. The front desk will confirm on WhatsApp.</p>
                  {result.emailNote && <p className="email-status-note"><CheckCircle2 size={14} /> {result.emailNote}</p>}
                  <div className="booking-confirmed-card">
                    <span className="ref-label">Booking reference</span>
                    <strong className="ref-code">{result.reference}</strong>
                    <div className="ref-details"><span>Total <strong>{formatMoney(result.total)}</strong></span><span>Status <strong className="status-badge">Pending confirmation</strong></span></div>
                  </div>
                  <div className="success-actions-row">
                    <a className="btn-submit-booking-request" href={result.invoiceUrl} download><Download size={16} /> Download pro-forma invoice (PDF)</a>
                    <a href={`${WA}${encodeURIComponent(`Hello Sunrise Motel, I have sent booking request ${result.reference} for ${bookingRoom.name} (${checkIn} to ${checkOut}).`)}`} target="_blank" rel="noreferrer" className="btn-whatsapp-success"><MessageCircle size={18} /> Chat with the front desk</a>
                    <a className="btn-done-dismiss" href={result.trackUrl}>Track this booking</a>
                    <button className="btn-done-dismiss" onClick={closeBooking}>Back to the website</button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
