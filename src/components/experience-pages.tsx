"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock3,
  Coffee,
  Compass,
  Download,
  Flame,
  Layers,
  Loader2,
  Mail,
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
  Star,
  Users,
  Utensils,
  Waves,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { SunriseLogo } from "@/components/sunrise-logo";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-MW", {
    style: "currency",
    currency: "MWK",
    maximumFractionDigits: 0,
  }).format(value);

function nightsBetween(start: string, end: string) {
  if (!start || !end) return 1;
  const s = new Date(`${start}T12:00:00`).getTime();
  const e = new Date(`${end}T12:00:00`).getTime();
  return Math.max(1, Math.round((e - s) / 86400000));
}

function isoPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatStayDate(iso: string) {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------- SHARED LAYOUT FRAME ----------------
export function PageFrame({ children, active }: { children: ReactNode; active: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="sunrise-app-root">
      {/* Top Utility */}
      <div className="mobile-top-utility">
        <div className="utility-container">
          <span className="utility-item">
            <MapPin size={12} className="accent-orange" /> Area 5, Lilongwe
          </span>
          <a href="tel:+265998688332" className="utility-link">
            <Phone size={12} className="accent-orange" /> +265 998 688 332
          </a>
          <a href="/admin" className="utility-admin-pill">
            Manager Access
          </a>
        </div>
      </div>

      {/* Header */}
      <header className="mobile-main-header">
        <div className="header-inner">
          <a href="/" className="header-logo-link">
            <SunriseLogo size="small" animated={true} />
          </a>

          <nav className={`header-nav-menu ${mobileOpen ? "is-visible" : ""}`}>
            <a href="/stay" className={active === "Stay" ? "active" : ""}>
              <BedDouble size={16} /> Stay
            </a>
            <a href="/dine" className={active === "Dine" ? "active" : ""}>
              <Utensils size={16} /> Dine
            </a>
            <a href="/unwind" className={active === "Unwind" ? "active" : ""}>
              <Waves size={16} /> Unwind
            </a>
            <a href="/connect" className={active === "Connect" ? "active" : ""}>
              <Wifi size={16} /> Connect
            </a>
            <a href="/gallery" className={active === "Gallery" ? "active" : ""}>
              <Layers size={16} /> Gallery
            </a>
            <a href="/track" className={active === "Track" ? "active" : ""}>
              <Search size={16} /> Track booking
            </a>
            <a href="/admin" className="admin-nav-link">
              <ShieldCheck size={16} /> Admin Portal
            </a>
          </nav>

          <div className="header-right-actions">
            <a
              href="https://wa.me/265998688332?text=Hello%20Sunrise%20Motel%2C%20I%20would%20like%20to%20make%20an%20enquiry."
              target="_blank"
              rel="noreferrer"
              className="btn-whatsapp-header"
            >
              <MessageCircle size={16} /> <span>WhatsApp</span>
            </a>
            <button
              className="menu-toggle-btn"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle navigation menu"
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>

      {/* Page Body */}
      <main>{children}</main>

      {/* Footer */}
      <footer className="mobile-site-footer">
        <div className="footer-content">
          <SunriseLogo size="default" animated={false} theme="dark" />
          <p className="footer-tagline">
            “Your warm welcome in the heart of Lilongwe.” Comfortable rooms, generous meals, lively evenings and dependable connectivity.
          </p>

          <div className="footer-links-grid">
            <div>
              <strong>EXPLORE</strong>
              <a href="/stay">Rooms & Stay</a>
              <a href="/dine">Restaurant & Menu</a>
              <a href="/unwind">Events & Braai</a>
              <a href="/connect">Work & Coffee</a>
            </div>
            <div>
              <strong>LOCATION & CONTACT</strong>
              <p><MapPin size={13} /> Mzimba Road, behind Bwasila Secondary School, Area 5, Lilongwe</p>
              <p><Phone size={13} /> +265 998 688 332</p>
              <a href="https://wa.me/265998688332" target="_blank" rel="noreferrer">
                <MessageCircle size={13} /> WhatsApp Front Desk
              </a>
            </div>
          </div>

          <div className="footer-bottom-bar">
            <span>© 2026 Sunrise Motel. All rights reserved.</span>
          </div>
        </div>
      </footer>

      {/* Fixed Mobile Bottom Bar */}
      <div className="mobile-fixed-bottom-bar">
        <a href="/stay" className={`bottom-bar-action ${active === "Stay" ? "active" : ""}`}>
          <BedDouble size={18} />
          <span>Stay</span>
        </a>
        <a href="/dine" className={`bottom-bar-action ${active === "Dine" ? "active" : ""}`}>
          <Utensils size={18} />
          <span>Dine</span>
        </a>
        <a href="/unwind" className={`bottom-bar-action ${active === "Unwind" ? "active" : ""}`}>
          <Waves size={18} />
          <span>Unwind</span>
        </a>
        <a href="/connect" className={`bottom-bar-action ${active === "Connect" ? "active" : ""}`}>
          <Wifi size={18} />
          <span>Connect</span>
        </a>
      </div>
    </div>
  );
}

// ---------------- GALLERY (shared grid + lightbox) ----------------
export type GalleryImageItem = { id: string; title: string; category: string; imageUrl: string; altText: string; caption: string | null };

export function GalleryGrid({ limit, showHeading = true }: { limit?: number; showHeading?: boolean }) {
  const [images, setImages] = useState<GalleryImageItem[]>([]);
  const [filter, setFilter] = useState("All");
  const [lightbox, setLightbox] = useState<{ index: number } | null>(null);

  useEffect(() => {
    fetch("/api/admin/gallery")
      .then((r) => r.json())
      .then((d) => setImages(d.images ?? []))
      .catch(() => setImages([]));
  }, []);

  const categories = ["All", ...Array.from(new Set(images.map((i) => i.category)))];
  const visible = (filter === "All" ? images : images.filter((i) => i.category === filter)).slice(0, limit ?? images.length);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight") setLightbox((l) => (l ? { index: (l.index + 1) % visible.length } : l));
      if (e.key === "ArrowLeft") setLightbox((l) => (l ? { index: (l.index - 1 + visible.length) % visible.length } : l));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, visible.length]);

  return (
    <div className="gallery-block">
      {showHeading && (
        <div className="section-head">
          <span className="eyebrow"><span className="eyebrow-line" /> PICTURES</span>
          <h2>Rooms, courtyard, kitchen & evenings</h2>
          <p>Room photos are the real Sunrise Motel listing photographs. Food and event pictures are illustrative until the team uploads their own from the manager portal.</p>
        </div>
      )}
      <div className="gallery-filter-row">
        {categories.map((c) => (
          <button key={c} className={filter === c ? "active" : ""} onClick={() => setFilter(c)}>{c}</button>
        ))}
      </div>
      <div className="gallery-grid">
        {visible.map((img, i) => (
          <button key={img.id} className="gallery-tile" onClick={() => setLightbox({ index: i })} aria-label={`Open ${img.title}`}>
            <img src={img.imageUrl} alt={img.altText} loading="lazy" />
            <span className="gallery-tile-label"><strong>{img.title}</strong><small>{img.category}</small></span>
          </button>
        ))}
      </div>
      {limit && images.length > limit && (
        <div className="gallery-more"><a className="btn-open-slideshow-secondary" href="/gallery"><Layers size={14} /> See all {images.length} pictures</a></div>
      )}

      {lightbox && visible[lightbox.index] && (
        <div className="slideshow-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setLightbox(null); }}>
          <div className="slideshow-modal-card">
            <button className="slideshow-close-btn" onClick={() => setLightbox(null)} aria-label="Close"><X size={20} /></button>
            <div className="slideshow-top-header">
              <div>
                <span className="eyebrow eyebrow-light"><span className="eyebrow-line" /> {visible[lightbox.index].category}</span>
                <h2>{visible[lightbox.index].title}</h2>
              </div>
              <span className="slide-counter">{lightbox.index + 1} / {visible.length}</span>
            </div>
            <div className="slideshow-viewport">
              <img src={visible[lightbox.index].imageUrl} alt={visible[lightbox.index].altText} />
              <button className="slide-nav-btn prev-btn" onClick={() => setLightbox({ index: (lightbox.index - 1 + visible.length) % visible.length })} aria-label="Previous"><ChevronLeft size={24} /></button>
              <button className="slide-nav-btn next-btn" onClick={() => setLightbox({ index: (lightbox.index + 1) % visible.length })} aria-label="Next"><ChevronRight size={24} /></button>
            </div>
            {visible[lightbox.index].caption && <p className="lightbox-caption">{visible[lightbox.index].caption}</p>}
            <div className="slideshow-thumbnails-row">
              {visible.map((img, i) => (
                <button key={img.id} className={`thumbnail-btn ${i === lightbox.index ? "active" : ""}`} onClick={() => setLightbox({ index: i })}><img src={img.imageUrl} alt="" /></button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function GalleryPage() {
  return (
    <PageFrame active="Gallery">
      <section className="mobile-hero-section hero-compact">
        <div className="hero-content-wrapper">
          <span className="eyebrow eyebrow-light"><span className="eyebrow-line" /> GALLERY</span>
          <h1 className="hero-headline">Take a look <em>around.</em></h1>
          <p className="hero-description">Rooms, the courtyard, what the kitchen is serving and how the evenings feel at Sunrise Motel, Area 5.</p>
        </div>
      </section>
      <section className="mobile-rooms-section">
        <GalleryGrid showHeading={false} />
      </section>
    </PageFrame>
  );
}

// ---------------- STAY PAGE ----------------
export function StayPage() {
  const [checkIn, setCheckIn] = useState(() => isoPlus(1));
  const [checkOut, setCheckOut] = useState(() => isoPlus(4));
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Slideshow
  const [activeSlideshow, setActiveSlideshow] = useState<any | null>(null);
  const [slideIdx, setSlideIdx] = useState(0);

  // Booking form modal
  const [bookingRoom, setBookingRoom] = useState<any | null>(null);
  const [breakfastQty, setBreakfastQty] = useState(0);
  const [transfer, setTransfer] = useState(false);
  const [lateOut, setLateOut] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookingRef, setBookingRef] = useState("");
  const [bookingError, setBookingError] = useState("");

  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/availability?checkIn=${checkIn}&checkOut=${checkOut}`);
      const data = await res.json();
      if (data.rooms) setRooms(data.rooms);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, [checkIn, checkOut]);

  const extrasTotal = (breakfastQty * 8500 * nights) + (transfer ? 25000 : 0) + (lateOut ? 15000 : 0);
  const grandTotal = bookingRoom ? (bookingRoom.rate * nights) + extrasTotal : 0;

  const handleBookingSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!bookingRoom) return;
    setSubmitting(true);
    setBookingError("");

    const formData = new FormData(e.currentTarget);
    const guestName = String(formData.get("guestName") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const arrival = String(formData.get("arrival") ?? "").trim();
    const requests = String(formData.get("requests") ?? "").trim();

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomTypeId: bookingRoom.id,
          roomType: bookingRoom.name,
          checkIn,
          checkOut,
          adults,
          children,
          nightlyRate: bookingRoom.rate,
          extrasTotal,
          extras: [
            ...(breakfastQty > 0 ? [{ label: `Daily breakfast × ${breakfastQty} guest${breakfastQty > 1 ? "s" : ""} (${nights} nights)`, amount: breakfastQty * 8500 * nights }] : []),
            ...(transfer ? [{ label: "Airport shuttle (one-way)", amount: 25000 }] : []),
            ...(lateOut ? [{ label: "Late check-out until 15:00", amount: 15000 }] : []),
          ],
          guestName,
          phone,
          email: email || null,
          arrival: arrival || null,
          requests: requests || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit booking.");

      setBookingRef(data.booking?.reference ?? "SM-2026");
      fetchRooms();
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : "Error submitting request.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalRoomsFree = useMemo(() => rooms.reduce((s, r) => s + (r.availableCount || 0), 0), [rooms]);

  const handleCheckInChange = (value: string) => {
    setCheckIn(value);
    if (value && checkOut && value >= checkOut) {
      setCheckOut(addDays(value, 1));
    }
  };

  const scrollToRooms = () => {
    document.getElementById("stay-rooms")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <PageFrame active="Stay">
      {/* Page Header — room photography, live dates, friendly summary */}
      <section className="mobile-hero-section stay-hero">
        <div className="hero-backdrop stay-hero-backdrop" />
        <div className="hero-gradient-overlay" />
        <div className="hero-content-wrapper">
          <div className="hero-badge-pill"><span className="pulsing-sun-dot" /><span>STAY · LIVE ROOM INVENTORY · AREA 5</span></div>
          <span className="eyebrow eyebrow-light"><span className="eyebrow-line" /> ACCOMMODATION & ROOMS</span>
          <h1 className="hero-headline">Stay Comfortably. <em>Sleep Soundly.</em></h1>
          <p className="hero-description">
            Real room photos, honest availability and direct booking — no account, no password. Pick your dates and only rooms that are free for <strong>every night</strong> of your stay are shown.
          </p>

          {/* Date + guests search card */}
          <div className="hero-search-card">
            <div className="search-card-header">
              <div className="header-title"><CalendarCheck size={16} className="accent-orange" /><strong>Check live availability</strong></div>
              <span className="live-pill">{loading ? <Loader2 size={12} className="spin" /> : <span className="live-dot" />} {loading ? "Checking…" : `${totalRoomsFree} rooms free`}</span>
            </div>
            <div className="search-fields-grid stay-search-grid">
              <div className="search-field">
                <label>Check-in</label>
                <div className="input-icon-wrap">
                  <Calendar size={15} />
                  <input
                    type="date"
                    value={checkIn}
                    onChange={(e) => handleCheckInChange(e.target.value)}
                    min={isoPlus(0)}
                    required
                  />
                </div>
                <small className="date-hint">{formatStayDate(checkIn)} · from 14:00</small>
              </div>
              <div className="search-field">
                <label>Check-out</label>
                <div className="input-icon-wrap">
                  <Calendar size={15} />
                  <input
                    type="date"
                    value={checkOut}
                    min={addDays(checkIn, 1)}
                    onChange={(e) => setCheckOut(e.target.value)}
                    required
                  />
                </div>
                <small className="date-hint">{formatStayDate(checkOut)} · by 10:00</small>
              </div>
              <div className="search-field">
                <label>Adults</label>
                <div className="stepper-box">
                  <button type="button" onClick={() => setAdults(Math.max(1, adults - 1))} aria-label="Fewer adults"><Minus size={13} /></button>
                  <span><Users size={13} className="accent-orange" /> {adults}</span>
                  <button type="button" onClick={() => setAdults(Math.min(6, adults + 1))} aria-label="More adults"><Plus size={13} /></button>
                </div>
              </div>
              <div className="search-field">
                <label>Children</label>
                <div className="stepper-box">
                  <button type="button" onClick={() => setChildren(Math.max(0, children - 1))} aria-label="Fewer children"><Minus size={13} /></button>
                  <span>{children}</span>
                  <button type="button" onClick={() => setChildren(Math.min(4, children + 1))} aria-label="More children"><Plus size={13} /></button>
                </div>
              </div>
            </div>
            <div className="search-summary-strip">
              <div className="nights-badge"><strong>{nights} night{nights > 1 ? "s" : ""}</strong><small>{formatStayDate(checkIn)} → {formatStayDate(checkOut)} · {adults} adult{adults > 1 ? "s" : ""}{children > 0 ? ` · ${children} child${children > 1 ? "ren" : ""}` : ""}</small></div>
              <div className="anti-overbooking-notice"><ShieldCheck size={14} className="text-sage" /><span>Double-booking protected</span></div>
            </div>
            <button type="button" className="btn-submit-booking-request stay-cta" onClick={scrollToRooms}>See available rooms <ArrowRight size={16} /></button>
          </div>

          {/* Related room imagery — tap to preview */}
          <div className="stay-hero-photos">
            {[
              { src: "/images/deluxe-main.jpg", label: "Deluxe King", sub: "Guest favourite" },
              { src: "/images/hero-standard.jpg", label: "Standard Queen", sub: "Real listing photo" },
              { src: "/images/twin-main.jpg", label: "Twin Room", sub: "For two guests" },
            ].map((p) => (
              <button key={p.src} type="button" className="stay-hero-photo" onClick={scrollToRooms} aria-label={`See ${p.label} availability`}>
                <img src={p.src} alt={`${p.label} at Sunrise Motel`} loading="eager" />
                <span className="stay-hero-photo-label"><strong>{p.label}</strong><small>{p.sub}</small></span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Room Listing */}
      <section id="stay-rooms" className="mobile-rooms-section">
        <div className="section-head">
          <span className="eyebrow"><span className="eyebrow-line" /> LIVE RESULTS</span>
          <h2>Available for your dates</h2>
          <p>{formatStayDate(checkIn)} → {formatStayDate(checkOut)} · {nights} night{nights > 1 ? "s" : ""} · {adults} adult{adults > 1 ? "s" : ""}{children > 0 ? ` · ${children} child${children > 1 ? "ren" : ""}` : ""}. Tap a photo to open the full room slideshow.</p>
        </div>
        {loading && rooms.length === 0 ? (
          <div className="rooms-loading"><Loader2 size={22} className="spin" /><p>Checking live room inventory…</p></div>
        ) : rooms.length === 0 ? (
          <div className="empty-state"><BedDouble size={30} /><p>No rooms found for these dates. Try different dates or WhatsApp us.</p></div>
        ) : (
        <div className="rooms-cards-list">
          {rooms.map((room) => (
            <article key={room.id} className={`room-card-structured ${room.isSoldOut ? "card-sold-out" : ""}`}>
              <div className="room-photo-header">
                <img src={room.images[0]} alt={`${room.name} at Sunrise Motel`} loading="lazy" />
                <div className="photo-tag-overlay">
                  <span className={`availability-chip ${room.isSoldOut ? "chip-sold-out" : room.availableCount === 1 ? "chip-low" : "chip-available"}`}>
                    {room.statusText}
                  </span>
                  {room.badge && <span className="badge-chip">{room.badge}</span>}
                </div>
                <button
                  className="btn-view-slideshow"
                  onClick={() => { setActiveSlideshow(room); setSlideIdx(0); }}
                  aria-label={`Open ${room.name} photo slideshow`}
                >
                  <Layers size={14} /> {room.images.length} photos
                </button>
              </div>

              <div className="room-card-content">
                <div className="room-title-rate-row">
                  <div>
                    <h3>{room.name}</h3>
                    <p className="room-desc">{room.description}</p>
                  </div>
                  <div className="room-pricing-box">
                    <span className="from-label">Per Night</span>
                    <strong className="rate-amount">{formatMoney(room.rate)}</strong>
                    <small className="stay-calc-hint">{formatMoney(room.rate * nights)} for {nights} nights</small>
                  </div>
                </div>

                <div className="room-specs-row">
                  <span><BedDouble size={14} className="accent-orange" /> {room.bed}</span>
                  <span><Users size={14} className="accent-orange" /> {room.sleeps}</span>
                  <span><Compass size={14} className="accent-orange" /> {room.size}</span>
                </div>
                <div className="availability-meta">
                  <span className={room.isSoldOut ? "meta-bad" : "meta-good"}>{room.isSoldOut ? "No rooms free for these nights" : `${room.availableCount} of ${room.totalInventory} free`}</span>
                  <span>{room.bookedCount === 0 ? "No other bookings on these dates" : `${room.bookedCount} already booked`}</span>
                </div>

                <div className="room-features-pills">
                  {room.features.map((f: string) => (
                    <span key={f} className="feature-pill"><Check size={12} className="accent-sage" /> {f}</span>
                  ))}
                </div>

                <div className="room-card-actions">
                  <button className="btn-open-slideshow-secondary" onClick={() => { setActiveSlideshow(room); setSlideIdx(0); }}>
                    <Layers size={14} /> Slideshow
                  </button>
                  {room.isSoldOut ? (
                    <button className="btn-book-room btn-disabled" disabled>Sold Out</button>
                  ) : (
                    <button
                      className="btn-book-room btn-active-book"
                      onClick={() => {
                        setBookingRoom(room);
                        setBookingRef("");
                        setBookingError("");
                        setBreakfastQty(0);
                        setTransfer(false);
                        setLateOut(false);
                      }}
                    >
                      Book Room <ArrowRight size={15} />
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
        )}
      </section>

      {/* Slideshow Modal */}
      {activeSlideshow && (
        <div className="slideshow-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setActiveSlideshow(null); }}>
          <div className="slideshow-modal-card">
            <button className="slideshow-close-btn" onClick={() => setActiveSlideshow(null)}><X size={20} /></button>
            <div className="slideshow-top-header">
              <div>
                <span className="eyebrow eyebrow-light"><span className="eyebrow-line" /> ROOM GALLERY</span>
                <h2>{activeSlideshow.name}</h2>
              </div>
              <span className="slide-counter">{slideIdx + 1} / {activeSlideshow.images.length}</span>
            </div>
            <div className="slideshow-viewport">
              <img src={activeSlideshow.images[slideIdx]} alt={`${activeSlideshow.name} — photo ${slideIdx + 1} of ${activeSlideshow.images.length}`} />
              <button className="slide-nav-btn prev-btn" onClick={() => setSlideIdx((prev) => (prev - 1 + activeSlideshow.images.length) % activeSlideshow.images.length)} aria-label="Previous photo">
                <ChevronLeft size={24} />
              </button>
              <button className="slide-nav-btn next-btn" onClick={() => setSlideIdx((prev) => (prev + 1) % activeSlideshow.images.length)} aria-label="Next photo">
                <ChevronRight size={24} />
              </button>
            </div>
            <div className="slideshow-thumbnails-row">
              {activeSlideshow.images.map((img: string, i: number) => (
                <button key={img} className={`thumbnail-btn ${i === slideIdx ? "active" : ""}`} onClick={() => setSlideIdx(i)}>
                  <img src={img} alt="" />
                </button>
              ))}
            </div>
            <div className="slideshow-specs-footer">
              <div className="specs-info">
                <strong>{formatMoney(activeSlideshow.rate)} / night</strong>
                <small>{activeSlideshow.bed} · {activeSlideshow.size}</small>
              </div>
              <button
                className="btn-book-from-slideshow"
                onClick={() => {
                  const r = activeSlideshow;
                  setActiveSlideshow(null);
                  setBookingRoom(r);
                }}
              >
                Book This Room <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Form Modal */}
      {bookingRoom && (
        <div className="booking-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setBookingRoom(null); }}>
          <div className="booking-modal-sheet">
            <button className="sheet-close-btn" onClick={() => setBookingRoom(null)}><X size={20} /></button>
            {!bookingRef ? (
              <form onSubmit={handleBookingSubmit} className="booking-dynamic-form">
                <div className="modal-sheet-header">
                  <span className="eyebrow"><span className="eyebrow-line" /> GUEST BOOKING & EXTRAS</span>
                  <h2>Request {bookingRoom.name}</h2>
                  <p>{formatStayDate(checkIn)} → {formatStayDate(checkOut)} · {nights} night{nights > 1 ? "s" : ""} · {adults} adult{adults > 1 ? "s" : ""}{children > 0 ? ` · ${children} child${children > 1 ? "ren" : ""}` : ""} · No login required</p>
                </div>

                {/* Extras Live Calculation Box */}
                <div className="extras-calculator-box">
                  <div className="extras-header">
                    <Sparkles size={16} className="accent-orange" />
                    <strong>Stay Extras Calculator</strong>
                  </div>

                  <div className="extra-item-row">
                    <div className="extra-left">
                      <Coffee size={16} className="accent-orange" />
                      <div>
                        <strong>Daily Breakfast</strong>
                        <small>MWK 8,500/day per person</small>
                      </div>
                    </div>
                    <div className="extra-stepper">
                      <button type="button" onClick={() => setBreakfastQty(Math.max(0, breakfastQty - 1))} aria-label="Fewer breakfasts"><Minus size={12} /></button>
                      <span>{breakfastQty}</span>
                      <button type="button" onClick={() => setBreakfastQty(Math.min(adults + children, breakfastQty + 1))} aria-label="More breakfasts"><Plus size={12} /></button>
                    </div>
                  </div>

                  <div className="extra-item-row">
                    <div className="extra-left">
                      <Compass size={16} className="accent-orange" />
                      <div>
                        <strong>Airport Shuttle</strong>
                        <small>MWK 25,000 one-way</small>
                      </div>
                    </div>
                    <label className="switch-toggle">
                      <input type="checkbox" checked={transfer} onChange={(e) => setTransfer(e.target.checked)} />
                      <span className="toggle-slider" />
                    </label>
                  </div>

                  <div className="extra-item-row">
                    <div className="extra-left">
                      <Clock3 size={16} className="accent-orange" />
                      <div>
                        <strong>Late Check-Out</strong>
                        <small>MWK 15,000 (till 15:00)</small>
                      </div>
                    </div>
                    <label className="switch-toggle">
                      <input type="checkbox" checked={lateOut} onChange={(e) => setLateOut(e.target.checked)} />
                      <span className="toggle-slider" />
                    </label>
                  </div>

                  <div className="live-calculation-summary">
                    <div className="calc-row"><span>Base Room ({nights} nights):</span><span>{formatMoney(bookingRoom.rate * nights)}</span></div>
                    {extrasTotal > 0 && <div className="calc-row extras-line"><span>Selected Extras:</span><span>+{formatMoney(extrasTotal)}</span></div>}
                    <div className="calc-row total-line"><strong>Total Estimated Amount:</strong><strong>{formatMoney(grandTotal)}</strong></div>
                  </div>
                </div>

                {/* Contact Inputs */}
                <div className="form-fields-group">
                  <label className="form-input-label">
                    <span>Full Name *</span>
                    <input name="guestName" required placeholder="e.g. Chisomo Banda" />
                  </label>
                  <div className="form-grid-2">
                    <label className="form-input-label">
                      <span>Phone / WhatsApp *</span>
                      <input name="phone" required placeholder="+265 ..." />
                    </label>
                    <label className="form-input-label">
                      <span>Email (for Pro-Forma Invoice)</span>
                      <input name="email" type="email" placeholder="guest@example.com" />
                    </label>
                  </div>
                  <label className="form-input-label">
                    <span>Arrival Time / Special Requests</span>
                    <input name="requests" placeholder="e.g. Late check-in after 20:00" />
                  </label>
                </div>

                {bookingError && <div className="booking-error-banner"><AlertCircle size={15} /><span>{bookingError}</span></div>}

                <button type="submit" className="btn-submit-booking-request" disabled={submitting}>
                  {submitting ? <><Loader2 size={16} className="spin" /> Sending...</> : <>Send Booking Request ({formatMoney(grandTotal)}) <Send size={15} /></>}
                </button>
              </form>
            ) : (
              <div className="booking-success-view">
                <div className="success-icon-bubble"><CheckCircle2 size={44} /></div>
                <h2>Booking Request Sent!</h2>
                <p>We received your request for <strong>{bookingRoom.name}</strong>.</p>
                <div className="booking-confirmed-card">
                  <span className="ref-label">Pro-Forma Reference</span>
                  <strong className="ref-code">{bookingRef}</strong>
                  <div className="ref-details">
                    <span>Total: <strong>{formatMoney(grandTotal)}</strong></span>
                    <span>Status: <strong className="status-badge">Pending Review</strong></span>
                  </div>
                </div>
                <div className="success-actions-row">
                  <a className="btn-submit-booking-request" href={`/api/invoices/${bookingRef}`} download>
                    <Download size={16} /> Download pro-forma invoice (PDF)
                  </a>
                  <a
                    href={`https://wa.me/265998688332?text=Hello%20Sunrise%20Motel%2C%20I%20have%20sent%20booking%20reference%20${bookingRef}.`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-whatsapp-success"
                  >
                    <MessageCircle size={18} /> WhatsApp Front Desk
                  </a>
                  <a className="btn-done-dismiss" href={`/track?ref=${bookingRef}`}>Track this booking</a>
                  <button className="btn-done-dismiss" onClick={() => setBookingRoom(null)}>Close</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </PageFrame>
  );
}

// ---------------- DINE PAGE ----------------
export function DinePage() {
  const [filter, setFilter] = useState("All");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orderSent, setOrderSent] = useState(false);

  const menuItems = [
    { id: "platter", name: "Sunrise Signature Grill Platter", category: "From the grill", description: "Grilled beef skewers, chicken wings, golden chips, salad & house relish.", price: 28000, img: "/images/food-grill.jpg" },
    { id: "curry", name: "Slow-Cooked Beef Curry", category: "Mains", description: "Hearty local beef curry served with steaming nsima or rice.", price: 18500, img: "/images/food-curry.jpg" },
    { id: "salad", name: "Area 5 Fresh Garden Crunch Salad", category: "Light & fresh", description: "Crisp local greens, diced feta, cucumber & lemon vinaigrette.", price: 12000, img: "/images/food-salad.jpg" },
    { id: "breakfast", name: "Full English & Malawian Breakfast", category: "Mains", description: "Eggs, sausage, baked beans, toast & Malawian tea/coffee.", price: 14000, img: "/images/breakfast-coffee.jpg" },
    { id: "coffee", name: "Freshly Roasted Filter Coffee / Espresso", category: "Coffee & snacks", description: "Rich Malawian single origin coffee served hot or iced.", price: 4500, img: "/images/breakfast-coffee.jpg" },
  ];

  const categories = ["All", "From the grill", "Mains", "Light & fresh", "Coffee & snacks"];
  const visibleItems = filter === "All" ? menuItems : menuItems.filter((i) => i.category === filter);

  const totalItems = Object.values(cart).reduce((sum, n) => sum + n, 0);
  const totalCost = menuItems.reduce((sum, i) => sum + (cart[i.id] || 0) * i.price, 0);

  const addItem = (id: string) => setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  const removeItem = (id: string) => setCart((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) - 1) }));

  return (
    <PageFrame active="Dine">
      <section className="mobile-hero-section">
        <div className="hero-content-wrapper">
          <span className="eyebrow eyebrow-light"><span className="eyebrow-line" /> RESTAURANT & BAR</span>
          <h1 className="hero-headline">Come Hungry. <em>Eat Generously.</em></h1>
          <p className="hero-description">From sizzling braai cuts to comforting stews and barista coffee. Open 07:00 — 22:00 daily.</p>
        </div>
      </section>

      <section className="mobile-rooms-section">
        <div className="menu-page-filters">
          {categories.map((c) => (
            <button key={c} className={filter === c ? "active" : ""} onClick={() => setFilter(c)}>{c}</button>
          ))}
        </div>

        <div className="menu-page-grid" style={{ marginTop: 20 }}>
          {visibleItems.map((item) => (
            <article key={item.id} className="menu-page-card">
              <img src={item.img} alt={item.name} />
              <div>
                <span>{item.category}</span>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <div className="menu-page-card-bottom">
                  <strong>{formatMoney(item.price)}</strong>
                  <div className="extra-stepper">
                    <button onClick={() => removeItem(item.id)}><Minus size={12} /></button>
                    <span>{cart[item.id] || 0}</span>
                    <button onClick={() => addItem(item.id)}><Plus size={12} /></button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Order Basket */}
        <div className="hero-search-card" style={{ marginTop: 32 }}>
          <div className="search-card-header">
            <strong>Your Food Order ({totalItems} items)</strong>
            <strong className="rate-amount">{formatMoney(totalCost)}</strong>
          </div>
          {orderSent ? (
            <div className="booking-success-view">
              <CheckCircle2 size={36} className="accent-sage" />
              <h3>Kitchen Order Received!</h3>
              <p>We are preparing your order. The restaurant staff will WhatsApp you when ready.</p>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); setOrderSent(true); }} className="form-fields-group">
              <div className="form-grid-2">
                <input required placeholder="Your Name" />
                <input required placeholder="WhatsApp Phone" />
              </div>
              <div className="form-grid-2">
                <select defaultValue="dine_in">
                  <option value="dine_in">Dine-in (Table)</option>
                  <option value="pickup">Takeaway / Pickup</option>
                  <option value="room_service">Room Service</option>
                </select>
                <input placeholder="Room # or Preferred Time" />
              </div>
              <button type="submit" className="btn-submit-booking-request" disabled={totalItems === 0}>
                Send Order to Kitchen ({formatMoney(totalCost)}) <Send size={15} />
              </button>
            </form>
          )}
        </div>
      </section>
    </PageFrame>
  );
}

// ---------------- UNWIND PAGE ----------------
export function UnwindPage() {
  const [reserved, setReserved] = useState(false);
  const events = [
    { day: "THU", date: "24", title: "Sunset Happy Hour", time: "17:00 — 19:00", detail: "House pours, chilled drinks and conversation.", tag: "Drink Specials" },
    { day: "SAT", date: "26", title: "Lawn Braai & Sizzling Cuts", time: "12:00 — 20:00", detail: "Grilled platters, house relish and cold drinks on the grass.", tag: "From MWK 22,000" },
    { day: "SUN", date: "27", title: "Match Day Big Screen", time: "15:00 onwards", detail: "Live sports broadcast, beer buckets and snack baskets.", tag: "Free Entry" },
  ];

  return (
    <PageFrame active="Unwind">
      <section className="mobile-hero-section">
        <div className="hero-content-wrapper">
          <span className="eyebrow eyebrow-light"><span className="eyebrow-line" /> EXPERIENCES & SOCIAL</span>
          <h1 className="hero-headline">Braai Days. Happy Hours. <em>Relaxed Evenings.</em></h1>
          <p className="hero-description">Join friends, colleagues and guests for live events, good music and open air.</p>
        </div>
      </section>

      <section className="mobile-events-section" style={{ margin: "30px auto" }}>
        <div className="section-head">
          <span className="eyebrow eyebrow-light"><span className="eyebrow-line" /> THIS WEEK&apos;S SCHEDULE</span>
          <h2>What&apos;s On at Sunrise</h2>
        </div>
        <div className="events-cards-grid">
          {events.map((ev) => (
            <div key={ev.title} className="event-feature-card">
              <div className="event-card-body">
                <div className="event-date-block">
                  <small>{ev.day}</small>
                  <strong>{ev.date}</strong>
                </div>
                <div className="event-details">
                  <h4>{ev.title}</h4>
                  <small className="event-time"><Clock size={12} /> {ev.time}</small>
                  <p>{ev.detail}</p>
                  <span className="event-price-pill">{ev.tag}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Table Reservation Card */}
      <section className="mobile-rooms-section">
        <div className="hero-search-card">
          <div className="search-card-header">
            <strong>Reserve a Table or Braai Platter</strong>
            <Sparkles size={16} className="accent-orange" />
          </div>
          {reserved ? (
            <div className="booking-success-view">
              <CheckCircle2 size={36} className="accent-sage" />
              <h3>Table Request Received!</h3>
              <p>We will hold your spot for the event and contact you on WhatsApp.</p>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); setReserved(true); }} className="form-fields-group">
              <div className="form-grid-2">
                <input required placeholder="Your Name" />
                <input required placeholder="WhatsApp Number" />
              </div>
              <div className="form-grid-2">
                <select defaultValue="2">
                  <option value="2">2 Guests</option>
                  <option value="4">4 Guests</option>
                  <option value="6">6+ Group</option>
                </select>
                <input type="date" defaultValue="2026-07-26" />
              </div>
              <button type="submit" className="btn-submit-booking-request">
                Reserve Table / Braai Spot <Send size={15} />
              </button>
            </form>
          )}
        </div>
      </section>
    </PageFrame>
  );
}

// ---------------- CONNECT PAGE ----------------
export function ConnectPage() {
  const [enquirySent, setEnquirySent] = useState(false);

  return (
    <PageFrame active="Connect">
      <section className="mobile-hero-section">
        <div className="hero-content-wrapper">
          <span className="eyebrow eyebrow-light"><span className="eyebrow-line" /> WORK, COFFEE & SPEED</span>
          <h1 className="hero-headline">Fast Starlink Wi-Fi. <em>Quiet Focus.</em></h1>
          <p className="hero-description">Settle in with a fresh cup of coffee, desk power and dependable high-speed internet.</p>
        </div>
      </section>

      <section className="mobile-pillars-section">
        <div className="pillars-cards-grid">
          <div className="pillar-link-card">
            <Wifi size={24} className="accent-orange" />
            <h3 style={{ marginTop: 12 }}>Starlink High-Speed</h3>
            <p>Dependable video calls, file uploads and browsing with back-up generator power.</p>
          </div>
          <div className="pillar-link-card">
            <Coffee size={24} className="accent-orange" />
            <h3 style={{ marginTop: 12 }}>Barista Coffee & Bites</h3>
            <p>Fresh espresso, tea and light snacks delivered to your work table from 07:00.</p>
          </div>
          <div className="pillar-link-card">
            <Zap size={24} className="accent-orange" />
            <h3 style={{ marginTop: 12 }}>Power Access</h3>
            <p>Convenient charging plugs at courtyard and lounge seating areas.</p>
          </div>
          <div className="pillar-link-card">
            <Users size={24} className="accent-orange" />
            <h3 style={{ marginTop: 12 }}>Casual Meetings</h3>
            <p>Comfortable tables for informal client catch-ups and small group working sessions.</p>
          </div>
        </div>

        {/* Workspace Form */}
        <div className="hero-search-card" style={{ marginTop: 32 }}>
          <div className="search-card-header">
            <strong>Enquire About Day Workspace / Meeting Table</strong>
          </div>
          {enquirySent ? (
            <div className="booking-success-view">
              <CheckCircle2 size={36} className="accent-sage" />
              <h3>Enquiry Sent!</h3>
              <p>Our team will prepare a work spot for you.</p>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); setEnquirySent(true); }} className="form-fields-group">
              <div className="form-grid-2">
                <input required placeholder="Your Name" />
                <input required placeholder="WhatsApp Number" />
              </div>
              <input placeholder="Requirements (e.g. 3 people for 2 hours with coffee)" />
              <button type="submit" className="btn-submit-booking-request">
                Send Workspace Enquiry <Send size={15} />
              </button>
            </form>
          )}
        </div>
      </section>
    </PageFrame>
  );
}
