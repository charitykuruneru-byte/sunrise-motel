"use client";

import {
  AlertCircle,
  Armchair,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Beer,
  BedDouble,
  Briefcase,
  CakeSlice,
  Calendar,
  CalendarCheck,
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
  Laptop,
  Layers,
  Loader2,
  Music,
  PartyPopper,
  MapPin,
  MessageCircle,
  Minus,
  Phone,
  Play,
  Plus,
  Presentation,
  Send,
  ShieldCheck,
  Sparkles,
  Timer,
  Trees,
  Trophy,
  Users,
  Utensils,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import SafeImage from "@/components/safe-image";
import SiteNav from "@/components/site-nav";
import { SunriseLogo } from "@/components/sunrise-logo";

/**
 * One dish as the guest reads it. ADDENDUM (staff dashboard §15.1): supplied by the server from
 * `menu_items`, so the desk's sold-out toggle is visible on this page the moment it is tapped.
 */
export type DineItem = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  img: string;
  isAvailable: boolean;
};

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
  // Local calendar parts, never `toISOString()`: at 01:00 in Malawi (UTC+2) the UTC
  // slice is still yesterday, so "tomorrow" would come back as today.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  return (
    <div className="sunrise-app-root">
      {/* ONE navigation for the whole site (addendum "navigation & image standards",
          Part 2.6: "Manager portal is a text link, never a button" and "relative links
          only"). Every inner page uses the same three tiers as the home page, so a
          guest never has to relearn the header. */}
      <SiteNav active={active} />

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

      {/* The mobile bottom bar is now the shared sticky action bar inside SiteNav:
          "Check availability" + WhatsApp, on every page (Part 2.4). */}
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
      <div className="gallery-grid sell-grid">
        {visible.map((img, i) => (
          <button key={img.id} className="gallery-tile gallery-card sell-card" onClick={() => setLightbox({ index: i })} aria-label={`Open ${img.title}`}>
            {/* Gallery standard (Part 5.3/5.4): 4:3, lazy below the fold, real alt text
                describing the scene, and a clean placeholder rather than a broken icon. */}
            <SafeImage
              src={img.imageUrl}
              alt={img.altText || `${img.title} at Sunrise Motel, Area 5, Lilongwe`}
              width={1000}
              height={750}
              fallbackLabel={img.title}
            />
            <span className="gallery-tile-label sell-label"><strong>{img.title}</strong><small>{img.category}</small></span>
          </button>
        ))}
      </div>
      {limit && images.length > limit && (
        <div className="gallery-more"><a className="btn-open-slideshow-secondary" href="/gallery"><Layers size={14} /> See all {images.length} pictures</a></div>
      )}
      {images.length === 0 && (
        <div className="empty-state"><Layers size={22} /><p>Pictures are loading… if they stay blank, refresh the page.</p></div>
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
              <SafeImage
                src={visible[lightbox.index].imageUrl}
                alt={visible[lightbox.index].altText || visible[lightbox.index].title}
                width={1000}
                height={750}
                fallbackLabel={visible[lightbox.index].title}
              />
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
  // ONE night, not three: a booking starts at the shortest stay there is and the
  // guest taps ＋ to add nights (`changeNights` below).
  const [checkOut, setCheckOut] = useState(() => isoPlus(2));
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [roomsError, setRoomsError] = useState("");

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

  /**
   * THE NIGHTS STEPPER. The guest sets the stay one night at a time, starting at
   * ONE, and check-out is DERIVED here and never typed: + simply pushes the
   * departure date along, so the two can never disagree. Thirty is the ceiling —
   * past that the desk would rather take the booking by phone.
   */
  const changeNights = (next: number) => {
    const wanted = Math.min(30, Math.max(1, next));
    setCheckOut(addDays(checkIn, wanted));
  };

  const fetchRooms = async () => {
    setLoading(true);
    setRoomsError("");
    try {
      // `no-store` so the answer is the server's own: availability must never be
      // served from a cache, browser or service worker.
      const res = await fetch(`/api/availability?checkIn=${checkIn}&checkOut=${checkOut}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Availability check failed (${res.status}).`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const list = Array.isArray(data.rooms) ? data.rooms : [];
      setRooms(list);
      if (list.length === 0) setRoomsError("No rooms came back from the server for these dates. Try different dates or WhatsApp us.");
    } catch (e) {
      console.error(e);
      setRoomsError(e instanceof Error ? e.message : "Could not load rooms. Check your connection and try again.");
      setRooms([]);
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
    // Moving the arrival day keeps the LENGTH of the stay — the guest chose
    // nights, so nights is what travels with them to the new date.
    if (value) setCheckOut(addDays(value, nights));
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
                <label>Nights</label>
                {/* Two taps and no date picker: the stay starts at ONE night and +
                    adds another each time. Check-out is worked out from it below. */}
                <div className="stepper-box">
                  <button type="button" onClick={() => changeNights(nights - 1)} disabled={nights <= 1} aria-label="One night fewer"><Minus size={13} /></button>
                  <span aria-live="polite"><Calendar size={13} className="accent-orange" /> {nights} night{nights === 1 ? "" : "s"}</span>
                  <button type="button" onClick={() => changeNights(nights + 1)} disabled={nights >= 30} aria-label="One more night"><Plus size={13} /></button>
                </div>
                <small className="date-hint">Until {formatStayDate(checkOut)} · by 10:00</small>
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
              <div className="anti-overbooking-notice"><ShieldCheck size={14} className="text-[var(--sage)]" /><span>Double-booking protected</span></div>
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
          <div className="empty-state">
            <BedDouble size={30} />
            <p>{roomsError || "No rooms found for these dates. Try different dates or WhatsApp us."}</p>
            <button type="button" className="btn-open-slideshow-secondary" onClick={fetchRooms}>Try again</button>
          </div>
        ) : (
        <div className="rooms-cards-list sell-grid">
          {rooms.map((room) => (
            <article key={room.id} className={`room-card-structured sell-card ${room.isSoldOut ? "card-sold-out" : ""}`}>
              <div className="room-photo-header sell-photo">
                <img
                  src={(room.images && room.images[0]) || "/images/hero-standard.jpg"}
                  alt={`${room.name} at Sunrise Motel`}
                  loading="lazy"
                  onError={(e) => { e.currentTarget.src = "/images/hero-standard.jpg"; }}
                />
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
                <div className="sell-gradient">
                  <strong>{room.name}</strong>
                  <span>{formatMoney(room.rate)} / night</span>
                </div>
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

                <div className="room-card-actions sell-cta">
                  <button className="btn-open-slideshow-secondary" onClick={() => { setActiveSlideshow(room); setSlideIdx(0); }}>
                    <Layers size={14} /> View Room
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
                      Book Now <ArrowRight size={15} />
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
              <img
                src={activeSlideshow.images[slideIdx] || "/images/hero-standard.jpg"}
                alt={`${activeSlideshow.name} — photo ${slideIdx + 1} of ${activeSlideshow.images.length}`}
                onError={(e) => { e.currentTarget.src = "/images/hero-standard.jpg"; }}
              />
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
                  <img src={img} alt="" onError={(e) => { e.currentTarget.src = "/images/hero-standard.jpg"; }} />
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
export function DinePage({ items }: { items?: DineItem[] } = {}) {
  const [filter, setFilter] = useState("All");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orderSent, setOrderSent] = useState(false);
  // The order form lives in a POPUP, not at the bottom of the page: the guest
  // taps a dish and the form opens with that dish already in it. `orderType` is
  // pre-chosen by which button they pressed, and they can still change it inside.
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderType, setOrderType] = useState("dine_in");

  // ADDENDUM (staff dashboard §15.1): dishes come from `menu_items`, so a dish the desk marks
  // sold out during service stops being orderable here in the same second. The built-in list is
  // the fallback for a cold database, never the source of truth.
  const fallbackItems: DineItem[] = [
    { id: "platter", name: "Sunrise Signature Grill Platter", category: "From the grill", description: "Grilled beef skewers, chicken wings, golden chips, salad & house relish.", price: 28000, img: "/images/food-grill.jpg", isAvailable: true },
    { id: "curry", name: "Slow-Cooked Beef Curry", category: "Mains", description: "Hearty local beef curry served with steaming nsima or rice.", price: 18500, img: "/images/food-curry.jpg", isAvailable: true },
    { id: "salad", name: "Area 5 Fresh Garden Crunch Salad", category: "Light & fresh", description: "Crisp local greens, diced feta, cucumber & lemon vinaigrette.", price: 12000, img: "/images/food-salad.jpg", isAvailable: true },
    { id: "breakfast", name: "Full English & Malawian Breakfast", category: "Mains", description: "Eggs, sausage, baked beans, toast & Malawian tea/coffee.", price: 14000, img: "/images/breakfast-coffee.jpg", isAvailable: true },
    { id: "coffee", name: "Freshly Roasted Filter Coffee / Espresso", category: "Coffee & snacks", description: "Rich Malawian single origin coffee served hot or iced.", price: 4500, img: "/images/breakfast-coffee.jpg", isAvailable: true },
  ];
  const menuItems = items && items.length > 0 ? items : fallbackItems;

  const categories = ["All", ...Array.from(new Set(menuItems.map((i) => i.category)))];
  const visibleItems = filter === "All" ? menuItems : menuItems.filter((i) => i.category === filter);

  const totalItems = Object.values(cart).reduce((sum, n) => sum + n, 0);
  const orderable = menuItems.filter((i) => i.isAvailable);
  const totalCost = orderable.reduce((sum, i) => sum + (cart[i.id] || 0) * i.price, 0);

  const addItem = (id: string) => setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  const removeItem = (id: string) => setCart((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) - 1) }));

  // What is actually in the order, so the popup can show the lines rather than
  // making the guest trust a number in a header.
  const cartLines = menuItems
    .map((i) => ({ item: i, qty: cart[i.id] || 0 }))
    .filter((line) => line.qty > 0);

  /**
   * Add this dish and open the order popup on it. `type` pre-chooses dine-in or
   * takeaway; room service stays one tap away inside. Before this, both card
   * buttons were `<a href="/dine?action=…">` — a query string nothing read, so
   * the page simply reloaded and the guest was no closer to ordering.
   */
  const openOrder = (id: string, type: "dine_in" | "pickup") => {
    setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    setOrderType(type);
    setOrderSent(false);
    setOrderOpen(true);
  };

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

        <div className="menu-page-grid sell-grid" style={{ marginTop: 20 }}>
          {visibleItems.map((item) => (
            <article key={item.id} className={`menu-page-card sell-card sell-dish ${item.isAvailable ? "" : "is-sold-out"}`}>
              <div className="sell-photo sell-dish-photo">
                <img src={item.img} alt={item.name} loading="lazy" style={item.isAvailable ? undefined : { filter: "grayscale(1)", opacity: 0.55 }} />
                <div className="sell-gradient">
                  <strong>{item.name}</strong>
                  <span>{formatMoney(item.price)}</span>
                </div>
              </div>
              <div>
                <span>{item.category}</span>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <div className="menu-page-card-bottom">
                  <strong>{formatMoney(item.price)}</strong>
                  {item.isAvailable ? (
                    <div className="mini-stepper">
                      <button type="button" onClick={() => removeItem(item.id)} aria-label={`Less ${item.name}`}><Minus size={12} /></button>
                      <span>{cart[item.id] || 0}</span>
                      <button type="button" onClick={() => addItem(item.id)} aria-label={`More ${item.name}`}><Plus size={12} /></button>
                    </div>
                  ) : (
                    <span style={{ color: "#fca5a5", fontWeight: 700, fontSize: 12 }}>Sold out today</span>
                  )}
                </div>
                <div className="sell-cta sell-dish-cta">
                  {item.isAvailable ? (
                    <>
                      <button type="button" className="btn-open-slideshow-secondary" onClick={() => openOrder(item.id, "dine_in")}>Order for Table</button>
                      <button type="button" className="btn-book-room btn-active-book" onClick={() => openOrder(item.id, "pickup")}>Takeaway</button>
                    </>
                  ) : (
                    <span style={{ color: "#cbd5e1", fontSize: 12 }}>
                      The kitchen has run out — it will be back on the menu tomorrow.
                    </span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Your order — the summary stays on the page, the FORM opens in a popup.
            A guest tapping a dish never has to scroll to the bottom to find the
            form, and the form opens with the dish they tapped already in it. */}
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
            <>
              <p className="dine-order-hint">
                Tap a dish above to add it, then send the whole order to the kitchen — dine-in, takeaway or room
                service. No account and no password, just a name and a number.
              </p>
              <button
                type="button"
                className="btn-submit-booking-request"
                onClick={() => setOrderOpen(true)}
                disabled={totalItems === 0}
              >
                {totalItems === 0 ? "Add a dish to order" : `Open order form (${formatMoney(totalCost)})`} <Send size={15} />
              </button>
            </>
          )}
        </div>
      </section>

      {/* THE ORDER POPUP — the same sheet pattern as the booking form, so a guest
          meets one modal behaviour across the whole site: click the backdrop or
          the X to leave, and nothing is lost by doing so. */}
      {orderOpen && (
        <div
          className="booking-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Send your food order to the kitchen"
          onClick={(e) => { if (e.target === e.currentTarget) setOrderOpen(false); }}
        >
          <div className="booking-modal-sheet">
            <button className="sheet-close-btn" onClick={() => setOrderOpen(false)} aria-label="Close the order form"><X size={20} /></button>
            {orderSent ? (
              <div className="booking-success-view">
                <CheckCircle2 size={36} className="accent-sage" />
                <h3>Kitchen Order Received!</h3>
                <p>We are preparing your order. The restaurant staff will WhatsApp you when ready.</p>
                <button type="button" className="btn-open-slideshow-secondary" onClick={() => setOrderOpen(false)}>Close</button>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); setOrderSent(true); }} className="form-fields-group">
                <div className="modal-sheet-header">
                  <span className="eyebrow"><span className="eyebrow-line" /> SEND TO KITCHEN</span>
                  <h2>Your food order</h2>
                  <p>
                    {totalItems} item{totalItems === 1 ? "" : "s"} · {formatMoney(totalCost)} · open 07:00 — 22:00 daily
                  </p>
                </div>

                {/* The order lines, still editable in here — so the popup is the
                    order, not a confirmation of something chosen elsewhere. */}
                <div className="dine-order-lines">
                  {cartLines.map((line) => (
                    <div className="dine-order-line" key={line.item.id}>
                      <div>
                        <strong>{line.item.name}</strong>
                        <small>{line.item.category} · {formatMoney(line.item.price)} each</small>
                      </div>
                      <div className="mini-stepper">
                        <button type="button" onClick={() => removeItem(line.item.id)} aria-label={`Less ${line.item.name}`}><Minus size={12} /></button>
                        <span>{line.qty}</span>
                        <button type="button" onClick={() => addItem(line.item.id)} aria-label={`More ${line.item.name}`}><Plus size={12} /></button>
                      </div>
                    </div>
                  ))}
                  {cartLines.length === 0 && (
                    <p className="dine-order-empty">
                      Nothing in the order yet — close this, tap a dish, and the form opens again with it in.
                    </p>
                  )}
                </div>

                <div className="form-grid-2">
                  <input required placeholder="Your Name" />
                  <input required placeholder="WhatsApp Phone" />
                </div>
                <div className="form-grid-2">
                  <select value={orderType} onChange={(e) => setOrderType(e.target.value)} aria-label="How would you like it">
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
        </div>
      )}
    </PageFrame>
  );
}

// ---------------- UNWIND PAGE ----------------
export function UnwindPage() {
  const [reserved, setReserved] = useState(false);
  // The reservation form opens in a popup, matching the order form on /dine and
  // the booking form on /stay — one modal behaviour across the whole site.
  const [reserveOpen, setReserveOpen] = useState(false);
  /**
   * THE WEEKLY BOARD — one source of truth for the event cards, the happy-hour
   * block and the reservation sheet, so the three can never drift apart.
   *
   * Day names only, never a date number: this board repeats every week, and a
   * card that still says "SAT 26" the following weekend is a wrong answer. Every
   * line is a published offer — the bar's own board advertises the Wednesday
   * happy hour as 17:00–18:30 with 20% off local beers and 10% off imported beers
   * and ciders, and the braai banner over the courtyard runs Wednesday, Friday,
   * Saturday and Sunday.
   */
  const events = [
    {
      day: "WED",
      hour: "5pm",
      when: "Every Wednesday · 17:00 — 18:30",
      title: "Happy Hour & Sizzling Braai",
      detail: "20% off all local beers, 10% off imported beers & ciders — with the grill going, the pool table open and the big screen on.",
      tag: "Drink specials",
      img: "/images/happy-hour-terrace.jpg",
      alt: "Cold drinks on the terrace during happy hour at Sunrise Motel",
    },
    {
      day: "FRI",
      hour: "12pm",
      when: "Fridays · from 12:00",
      title: "Braai & Sizzling Cuts",
      detail: "Grilled platters, house relish and cold drinks on the grass. Take the long table and bring the group.",
      tag: "From MWK 22,000 a platter",
      img: "/images/unwind-braai-chef.jpg",
      alt: "A Sunrise Motel chef carrying grilled meat past the courtyard braai",
    },
    {
      day: "SAT",
      hour: "12pm",
      when: "Saturdays · 12:00 — 20:00",
      title: "Braai, Pool & Big Screen",
      detail: "The courtyard grill all afternoon, the pool table in the bar, and the big screen for the late kick-off.",
      tag: "Walk in — no booking needed",
      img: "/images/unwind-pool-table.jpg",
      alt: "The pool table in the Sunrise Motel bar set up for a game",
    },
    {
      day: "SUN",
      hour: "3pm",
      when: "Sundays · from 15:00",
      title: "Match Day at the Big Screen",
      detail: "Live football the way the bar does it: snack platters for two or five — meatballs, calamari, samosa, bajias and far far.",
      tag: "Free entry",
      img: "/images/match-day.jpg",
      alt: "Guests watching a football match on the big screen at Sunrise Motel",
    },
  ];

  /**
   * WHAT THE KITCHEN PHOTOGRAPHS ITSELF. The titles are the dish names printed on
   * the kitchen's own cards, so nothing here labels a plate as something it is
   * not — and each tile is a link into the restaurant page, where the live menu
   * and the prices are.
   */
  const kitchenDishes = [
    { title: "Roast beef & roast potatoes", note: "Sliced at the table", img: "/images/dine-roast-beef.jpg", alt: "Sliced roast beef with roast potatoes on a Sunrise Motel serving dish" },
    { title: "Mutton curry, chapati & dhal", note: "Portuguese & Malawian", img: "/images/dine-mutton-curry.jpg", alt: "Mutton curry with folded chapati and a bowl of dhal" },
    { title: "Boiled beef", note: "Slow-cooked in its broth", img: "/images/dine-boiled-beef.jpg", alt: "A bowl of slow-boiled beef in its own broth" },
    { title: "Potato salad", note: "Beside the grill", img: "/images/dine-potato-salad.jpg", alt: "Creamy potato salad with green beans, egg and parsley" },
    { title: "Carrot salad", note: "Cold and fresh", img: "/images/dine-carrot-salad.jpg", alt: "Grated carrot salad with olives and onion" },
  ];

  return (
    <PageFrame active="Unwind">
      <section className="mobile-hero-section">
        <div className="hero-content-wrapper">
          <div className="hero-badge-pill"><span className="pulsing-sun-dot" /><span>EVENTS · BRAAI · BIG SCREEN · AREA 5</span></div>
          <span className="eyebrow eyebrow-light"><span className="eyebrow-line" /> EXPERIENCES & SOCIAL</span>
          <h1 className="hero-headline">Braai Days. Happy Hours. <em>Relaxed Evenings.</em></h1>
          <p className="hero-description">
            The courtyard grill, the bar with the pool table and the big screen for the match — Wednesday through Sunday.
            Walk up and join: nothing here needs an account, and nothing needs a booking.
          </p>
        </div>
      </section>

      <section className="mobile-events-section" style={{ margin: "30px auto" }}>
        <div className="section-head">
          <span className="eyebrow eyebrow-light"><span className="eyebrow-line" /> THE WEEKLY BOARD</span>
          <h2>What&apos;s On at Sunrise</h2>
          <p>
            The same rhythm every week: happy hour on Wednesday, the braai from Friday, football at the big screen on
            Sunday. Tap a card and the reservation sheet opens with that day already noted.
          </p>
        </div>
        <div className="events-cards-grid">
          {events.map((ev) => (
            <article key={ev.title} className="event-feature-card">
              {/* Every card leads with a photograph — the terrace, the grill, the pool
                  table — so the board reads as a picture of a night out rather than a
                  list of times. Dimensions are declared, so nothing jumps as it loads. */}
              <div className="event-card-img">
                <SafeImage src={ev.img} alt={ev.alt} width={1000} height={750} fallbackLabel={ev.title} />
                <span className="event-cat-tag">{ev.day}</span>
              </div>
              <div className="event-card-body">
                <div className="event-date-block">
                  <small>{ev.day}</small>
                  <strong>{ev.hour}</strong>
                </div>
                <div className="event-details">
                  <h4>{ev.title}</h4>
                  <small className="event-time"><Clock size={12} /> {ev.when}</small>
                  <p>{ev.detail}</p>
                  <span className="event-price-pill">{ev.tag}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* THE TWO THINGS THE COURTYARD IS FOR — the braai and the happy hour.
          Both blocks repeat what the bar's own boards advertise, so the page and
          the wall cannot disagree. */}
      <section className="mobile-rooms-section">
        <div className="exp-split">
          <div className="exp-split-media">
            <SafeImage
              src="/images/unwind-braai-chef.jpg"
              alt="A Sunrise Motel chef carrying a plate of grilled meat past the courtyard braai, with skewers on the grill"
              width={1000}
              height={667}
            />
            <span className="exp-split-tag"><Flame size={12} /> Wednesday · Friday · Saturday · Sunday</span>
          </div>
          <div className="exp-copy">
            <span className="eyebrow"><span className="eyebrow-line" /> THE COURTYARD GRILL</span>
            <h3>The coals are lit four days a week. <em>Bring your appetite.</em></h3>
            <p>
              Braai is how Lilongwe eats, and it is why the courtyard fills from Friday. Sizzling cuts come off the grill
              with house relish and cold drinks, and when the group is bigger than one plate there is a platter for the
              table.
            </p>
            <ul className="exp-list">
              <li><Check size={15} /> <span><strong>Wednesdays from 17:00</strong> — happy hour prices with the grill going.</span></li>
              <li><Check size={15} /> <span><strong>Fridays &amp; Saturdays from midday</strong> — the long tables, the garden and the courtyard.</span></li>
              <li><Check size={15} /> <span><strong>Sundays from 15:00</strong> — grill on, football on the big screen.</span></li>
              <li><Check size={15} /> <span>Platters from <strong>MWK 22,000</strong>. Walk in, or tell us you are coming and we hold a spot.</span></li>
            </ul>
            <div className="exp-actions">
              <button type="button" className="btn-submit-booking-request" onClick={() => setReserveOpen(true)}>
                Reserve a braai spot <Send size={15} />
              </button>
              <a className="btn-open-slideshow-secondary" href="/dine"><Utensils size={14} /> See the menu</a>
            </div>
          </div>
        </div>

        <div className="exp-split exp-split--flip">
          <div className="exp-split-media">
            <SafeImage
              src="/images/unwind-happy-hour-ice.jpg"
              alt="The Sunrise Motel happy hour notice beside a bucket of iced beer bottles"
              width={900}
              height={900}
            />
            <span className="exp-split-tag"><Beer size={12} /> Every Wednesday · 17:00 — 18:30</span>
          </div>
          <div className="exp-copy">
            <span className="eyebrow"><span className="eyebrow-line" /> HAPPY HOUR</span>
            <h3>Twenty percent off the local beers. <em>Ten off the imports.</em></h3>
            <p>
              An hour and a half, every Wednesday, at the bar and out on the terrace — and the kitchen keeps the braai
              going while it lasts, so nobody has to choose between a cold drink and something off the grill.
            </p>
            <ul className="exp-list">
              <li><Check size={15} /> <span><strong>20% off</strong> all local beers.</span></li>
              <li><Check size={15} /> <span><strong>10% off</strong> imported beers &amp; ciders.</span></li>
              <li><Check size={15} /> <span><strong>Sizzling braai available</strong> for the whole happy hour.</span></li>
              <li><Check size={15} /> <span>Beers, whiskeys, wines and rums behind the bar — ask what is cold and what is new.</span></li>
            </ul>
          </div>
        </div>
      </section>

      {/* WHAT ELSE IS ON TONIGHT — the bar, the table, the screen and the garden. */}
      <section className="mobile-rooms-section">
        <div className="section-head">
          <span className="eyebrow"><span className="eyebrow-line" /> NOT ONLY THE BRAAI</span>
          <h2>What else is on tonight</h2>
          <p>The restaurant, the bar and the courtyard are on the same plot — you move between them without leaving the gate.</p>
        </div>
        <div className="exp-facts">
          <div className="exp-fact">
            <span className="exp-fact-icon"><Beer size={20} /></span>
            <strong>The bar</strong>
            <small>Beers, whiskeys, wines and rums — a wide list, kept cold, with the terrace to drink it on.</small>
          </div>
          <div className="exp-fact">
            <span className="exp-fact-icon"><Trophy size={20} /></span>
            <strong>Pool table</strong>
            <small>In the bar and free to play. The quote on the wall says it best: play pool as you enjoy your drink.</small>
          </div>
          <div className="exp-fact">
            <span className="exp-fact-icon"><Music size={20} /></span>
            <strong>The big screen</strong>
            <small>Football never gets missed here. Match days bring snack platters, baskets and a full bar.</small>
          </div>
          <div className="exp-fact">
            <span className="exp-fact-icon"><Trees size={20} /></span>
            <strong>Courtyard &amp; garden</strong>
            <small>Long tables under the trees, the braai to one side, and room for the children to run.</small>
          </div>
        </div>
      </section>

      {/* FROM THE KITCHEN — the plates the dining room is proudest of, and every
          tile is a way into the restaurant page where the live menu lives. */}
      <section className="mobile-gallery-section">
        <div className="section-head">
          <span className="eyebrow"><span className="eyebrow-line" /> FROM THE KITCHEN</span>
          <h2>What the kitchen is sending out</h2>
          <p>
            Portuguese and Malawian cooking: slow-cooked meats, curries with chapati and dhal, and the cold salads that
            sit beside the grill. Prices and the full menu are on the restaurant page.
          </p>
        </div>
        <div className="gallery-grid sell-grid">
          {kitchenDishes.map((dish) => (
            <a key={dish.title} className="gallery-tile gallery-card sell-card" href="/dine">
              <SafeImage src={dish.img} alt={dish.alt} width={1000} height={750} fallbackLabel={dish.title} />
              <span className="gallery-tile-label sell-label"><strong>{dish.title}</strong><small>{dish.note}</small></span>
            </a>
          ))}
        </div>
        <div className="gallery-more">
          <a className="btn-open-slideshow-secondary" href="/dine"><Utensils size={14} /> Open the restaurant page</a>
        </div>
      </section>

      {/* SUNRISE IN A MINUTE — the property tour. `preload="none"` is deliberate:
          nothing is downloaded until the guest presses play, so a prepaid bundle
          is not spent by scrolling past a video. */}
      <section className="mobile-rooms-section">
        <div className="section-head">
          <span className="eyebrow"><span className="eyebrow-line" /> TAKE A LOOK</span>
          <h2>Sunrise in a minute</h2>
          <p>
            Seventy-six seconds through the gate: the restaurant, the bar, match day on the big screen, and what a room
            looks like when you stay the night.
          </p>
        </div>
        <figure className="exp-stage">
          <video
            controls
            playsInline
            preload="none"
            poster="/images/unwind-video-poster.jpg"
            width={852}
            height={478}
            aria-label="A short tour of Sunrise Motel: the restaurant, the bar, match days and the rooms"
          >
            <source src="/media/sunrise-tour-480p.mp4" type="video/mp4" />
            This browser cannot play the video — everything it shows is on this page and on the restaurant page.
          </video>
          <figcaption className="exp-stage-foot">
            <span><Clock3 size={13} /> 1 min 16 s · sound on when you press play</span>
            <span><ShieldCheck size={13} /> Loaded only when you tap play — it never spends data on its own.</span>
          </figcaption>
        </figure>
      </section>

      {/* THE BOARD AT THE BAR — the bar's own designed notices, shown whole inside
          a poster frame rather than cropped into a photograph. */}
      <section className="mobile-rooms-section">
        <div className="section-head">
          <span className="eyebrow"><span className="eyebrow-line" /> THE BOARD AT THE BAR</span>
          <h2>What is pinned up this month</h2>
          <p>The same notices that hang by the entrance, kept here so you can read them before you set off.</p>
        </div>
        <div className="exp-posters">
          <figure className="exp-poster">
            <SafeImage
              src="/images/unwind-match-day-specials.jpg"
              alt="Sunrise Motel match-day menu: platters for two and five, meat and chicken options, starches and full meals, with the orders number"
              width={900}
              height={1200}
              fallbackLabel="Match-day snack menu"
            />
            <figcaption>
              <strong>Match-day snack menu</strong>
              <small>Platters for two or five — meatballs, calamari, samosa, bajias and far far — plus burgers, hot dogs and chips.</small>
            </figcaption>
          </figure>
          <figure className="exp-poster">
            <SafeImage
              src="/images/unwind-happy-hour-board.jpg"
              alt="The Sunrise Motel happy hour board: 20% off local beers, 10% off imported beers and ciders, braai, every Wednesday from 17:00 to 18:30"
              width={900}
              height={900}
              fallbackLabel="Happy hour board"
            />
            <figcaption>
              <strong>Happy hour, every Wednesday</strong>
              <small>17:00 — 18:30, at Sunrise Motel, Area 5. Mouth-watering braai available throughout.</small>
            </figcaption>
          </figure>
          <figure className="exp-poster">
            <SafeImage
              src="/images/happy-hour-terrace.jpg"
              alt="Guests holding cold drinks on the terrace at Sunrise Motel during happy hour"
              width={900}
              height={1200}
              fallbackLabel="Happy hour on the terrace"
            />
            <figcaption>
              <strong>On the terrace</strong>
              <small>The courtyard seating, the long tables under the trees — and the drinks kept cold behind the bar.</small>
            </figcaption>
          </figure>
          <figure className="exp-poster">
            <SafeImage
              src="/images/unwind-pool-table.jpg"
              alt="The pool table with the balls racked on it in the Sunrise Motel bar"
              width={900}
              height={1200}
              fallbackLabel="The pool table"
            />
            <figcaption>
              <strong>Play pool as you enjoy your drink</strong>
              <small>The bar&apos;s own invitation, and the table is free — first to rack up plays.</small>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Table Reservation Card — summary on the page, form in a popup */}
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
            <>
              <p className="dine-order-hint">
                Tables by the screen, a braai spot on the courtyard, or a platter for the group — tell us the day and
                we hold it. No account needed.
              </p>
              <button type="button" className="btn-submit-booking-request" onClick={() => setReserveOpen(true)}>
                Reserve a table / braai spot <Send size={15} />
              </button>
            </>
          )}
        </div>
      </section>

      {/* THE RESERVATION POPUP */}
      {reserveOpen && (
        <div
          className="booking-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Reserve a table or braai platter"
          onClick={(e) => { if (e.target === e.currentTarget) setReserveOpen(false); }}
        >
          <div className="booking-modal-sheet">
            <button className="sheet-close-btn" onClick={() => setReserveOpen(false)} aria-label="Close the reservation form"><X size={20} /></button>
            {reserved ? (
              <div className="booking-success-view">
                <CheckCircle2 size={36} className="accent-sage" />
                <h3>Table Request Received!</h3>
                <p>We will hold your spot for the event and contact you on WhatsApp.</p>
                <button type="button" className="btn-open-slideshow-secondary" onClick={() => setReserveOpen(false)}>Close</button>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); setReserved(true); }} className="form-fields-group">
                <div className="modal-sheet-header">
                  <span className="eyebrow"><span className="eyebrow-line" /> RESERVE</span>
                  <h2>Hold a table for us</h2>
                  <p>
                    Happy hour on Wednesday, the braai from Friday, football on Sunday. Give us the day and the number and
                    the table is yours — we confirm on WhatsApp.
                  </p>
                </div>
                <div className="form-grid-2">
                  <input required placeholder="Your Name" />
                  <input required placeholder="WhatsApp Number" />
                </div>
                <div className="form-grid-2">
                  <select defaultValue="2" aria-label="How many guests">
                    <option value="2">2 Guests</option>
                    <option value="4">4 Guests</option>
                    <option value="6">6+ Group</option>
                  </select>
                  <input type="date" defaultValue={isoPlus(0)} min={isoPlus(0)} aria-label="Which day" />
                </div>
                <button type="submit" className="btn-submit-booking-request">
                  Reserve Table / Braai Spot <Send size={15} />
                </button>
              </form>
            )}
          </div>
        </div>
      )}
      {/* GOOD TO KNOW — the practical answers, and the way out to the rest of the
          site for anyone who came here for something else. */}
      <section className="mobile-rooms-section">
        <div className="section-head">
          <span className="eyebrow"><span className="eyebrow-line" /> GOOD TO KNOW</span>
          <h2>Before you come</h2>
          <p>Four things guests ask us at the gate, answered here so nobody has to phone first.</p>
        </div>
        <div className="exp-facts">
          <div className="exp-fact">
            <span className="exp-fact-icon"><Timer size={20} /></span>
            <strong>Kitchen 07:00 — 22:00</strong>
            <small>Every day, braai days included. The bar runs later on happy hour and match days.</small>
          </div>
          <div className="exp-fact">
            <span className="exp-fact-icon"><Banknote size={20} /></span>
            <strong>Pay at the table</strong>
            <small>Cash and mobile money at the bar or the table. Guests staying with us can ask for it on the room bill.</small>
          </div>
          <div className="exp-fact">
            <span className="exp-fact-icon"><Users size={20} /></span>
            <strong>Groups &amp; functions</strong>
            <small>Birthdays, farewells, team evenings, match days — tell us the number and we lay the tables out.</small>
          </div>
          <div className="exp-fact">
            <span className="exp-fact-icon"><MapPin size={20} /></span>
            <strong>Mzimba Road, Area 5</strong>
            <small>Behind Bwasila Secondary School, Lilongwe. Parking is on the plot, outside the courtyard.</small>
          </div>
        </div>
        <div className="exp-actions">
          <a className="btn-submit-booking-request" href="https://wa.me/265998688332" target="_blank" rel="noreferrer">
            <MessageCircle size={15} /> Ask the bar on WhatsApp
          </a>
          <a className="btn-open-slideshow-secondary" href="/connect"><Coffee size={14} /> Work, coffee &amp; Wi-Fi</a>
          <a className="btn-open-slideshow-secondary" href="/stay"><BedDouble size={14} /> Stay the night</a>
        </div>
      </section>
    </PageFrame>
  );
}

// ---------------- CONNECT PAGE ----------------
export function ConnectPage() {
  const [enquirySent, setEnquirySent] = useState(false);
  // Same popup treatment as the order and reservation forms.
  const [enquiryOpen, setEnquiryOpen] = useState(false);

  return (
    <PageFrame active="Connect">
      <section className="mobile-hero-section">
        <div className="hero-content-wrapper">
          <div className="hero-badge-pill"><span className="pulsing-sun-dot" /><span>WORK · STARLINK WI-FI · COFFEE FROM 07:00</span></div>
          <span className="eyebrow eyebrow-light"><span className="eyebrow-line" /> WORK, COFFEE & SPEED</span>
          <h1 className="hero-headline">Fast Starlink Wi-Fi. <em>Quiet Focus.</em></h1>
          <p className="hero-description">
            Bring the laptop, take a table under the trees and let the coffee come to you — desk power, dependable
            internet, and a kitchen behind it that opens at seven.
          </p>
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

        {/* Workspace Form — summary on the page, form in a popup */}
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
            <>
              <p className="dine-order-hint">
                A quiet desk for the day, a table for a small meeting, or coffee brought to your seat — tell us what
                the day looks like and we set it up.
              </p>
              <button type="button" className="btn-submit-booking-request" onClick={() => setEnquiryOpen(true)}>
                Send a workspace enquiry <Send size={15} />
              </button>
            </>
          )}
        </div>
      </section>

      {/* THE WORKING DAY — the workspace told in two story rows. Photographs lead,
          words follow, the same `exp-split` treatment the /unwind courtyard rows use. */}
      <section className="mobile-rooms-section">
        <div className="section-head">
          <span className="eyebrow"><span className="eyebrow-line" /> THE WORKING DAY</span>
          <h2>A quiet table, from seven in the morning</h2>
          <p>
            Nobody drives across town to answer email. Come in, take a table, and the coffee, the power and the internet
            are already taken care of.
          </p>
        </div>

        <div className="exp-split">
          <div className="exp-split-media">
            <SafeImage
              src="/images/workspace-coffee.jpg"
              alt="A wooden table by the window with a laptop on charge, an open notebook, a potted plant and a cup of coffee"
              width={1000}
              height={1333}
            />
            <span className="exp-split-tag"><Laptop size={12} /> Indoor tables · plug at the wall</span>
          </div>
          <div className="exp-copy">
            <span className="eyebrow"><span className="eyebrow-line" /> DESK SPACE</span>
            <h3>The Wi-Fi is the point. <em>The quiet is the bonus.</em></h3>
            <p>
              Starlink at the tables, plugs you do not have to fight over, and a generator that keeps the router up when
              the grid drops. Calls hold, uploads finish, and nobody asks you to move on after an hour.
            </p>
            <ul className="exp-list">
              <li><Check size={15} /> <span><strong>Starlink Wi-Fi</strong> at the indoor tables, the courtyard and the terrace.</span></li>
              <li><Check size={15} /> <span><strong>Charging plugs</strong> at the seating, with generator back-up on the plot.</span></li>
              <li><Check size={15} /> <span><strong>No minimum spend</strong> and no time limit — a coffee buys the table.</span></li>
              <li><Check size={15} /> <span><strong>From 07:00</strong>, when the kitchen opens and the first pots go on.</span></li>
            </ul>
            <div className="exp-actions">
              <button type="button" className="btn-submit-booking-request" onClick={() => setEnquiryOpen(true)}>
                Enquire about a workspace <Send size={15} />
              </button>
              <a className="btn-open-slideshow-secondary" href="/dine"><Utensils size={14} /> See the menu</a>
            </div>
          </div>
        </div>

        <div className="exp-split exp-split--flip">
          <div className="exp-split-media">
            <SafeImage
              src="/images/garden-seating.jpg"
              alt="Wooden chairs and a small table in the garden at dusk, surrounded by flowering plants and broad leaves"
              width={1000}
              height={667}
            />
            <span className="exp-split-tag"><Trees size={12} /> Courtyard &amp; garden tables</span>
          </div>
          <div className="exp-copy">
            <span className="eyebrow"><span className="eyebrow-line" /> OUTSIDE THE ROOM</span>
            <h3>Take the laptop outside. <em>Shade, breeze, refills.</em></h3>
            <p>
              The courtyard and the garden tables sit under the trees, close enough to the bar that a refill finds you on
              its own. It is the same internet with better scenery — and in the warm months it is where the laptops end up
              anyway.
            </p>
            <ul className="exp-list">
              <li><Check size={15} /> <span><strong>Courtyard &amp; garden</strong> tables, with waiting service from the bar.</span></li>
              <li><Check size={15} /> <span><strong>Shade for midday</strong>, and lamps on when the light goes.</span></li>
              <li><Check size={15} /> <span><strong>Something to eat</strong> between meetings, without packing up.</span></li>
            </ul>
            <div className="exp-actions">
              <a className="btn-submit-booking-request" href="https://wa.me/265998688332" target="_blank" rel="noreferrer">
                <MessageCircle size={15} /> Ask us to hold a table
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* PICK YOUR SPOT — the four seats guests actually choose between, answered
          before anyone has to ask at the counter. */}
      <section className="mobile-rooms-section">
        <div className="section-head">
          <span className="eyebrow"><span className="eyebrow-line" /> PICK YOUR SPOT</span>
          <h2>Four places to put the laptop down</h2>
          <p>Same Wi-Fi, same kitchen — a different kind of day depending on which one you take.</p>
        </div>
        <div className="exp-facts">
          <div className="exp-fact">
            <span className="exp-fact-icon"><Laptop size={20} /></span>
            <strong>The indoor tables</strong>
            <small>Closest to the plugs and the quietest room in the house — the one to take for a call you have to be heard on.</small>
          </div>
          <div className="exp-fact">
            <span className="exp-fact-icon"><Trees size={20} /></span>
            <strong>The courtyard</strong>
            <small>Shade under the trees with a waiter nearby. Screen-readable, though harder to read at midday sun.</small>
          </div>
          <div className="exp-fact">
            <span className="exp-fact-icon"><Armchair size={20} /></span>
            <strong>The lounge seats</strong>
            <small>Soft chairs and low tables for a short session, or the first meeting with somebody new.</small>
          </div>
          <div className="exp-fact">
            <span className="exp-fact-icon"><Presentation size={20} /></span>
            <strong>The meeting table</strong>
            <small>Seats a small group with room for a laptop each. Tell us the day and we keep it free for you.</small>
          </div>
        </div>
      </section>

      {/* COFFEE & SNACKS — the kitchen's half of the working day, at the same tables
          the first two rows describe. */}
      <section className="mobile-rooms-section">
        <div className="exp-split">
          <div className="exp-split-media">
            <SafeImage
              src="/images/breakfast-coffee.jpg"
              alt="A plate of fried snacks with sesame seeds and chilled glasses on a table beside the pool"
              width={1000}
              height={667}
            />
            <span className="exp-split-tag"><Coffee size={12} /> Served to your table</span>
          </div>
          <div className="exp-copy">
            <span className="eyebrow"><span className="eyebrow-line" /> COFFEE &amp; SNACKS</span>
            <h3>Order once, and the refills know where you are. <em>07:00 — 22:00.</em></h3>
            <p>
              Espresso, tea, cold drinks and light plates come out of the same kitchen that serves the restaurant — so
              lunch is either a short walk or a waiter away, whichever suits the meeting you are in.
            </p>
            <ul className="exp-list">
              <li><Check size={15} /> <span><strong>Coffee &amp; tea</strong> brought to the indoor tables, the courtyard and the terrace.</span></li>
              <li><Check size={15} /> <span><strong>Breakfast from 07:00</strong> — the full plate, or just toast and a pot of tea.</span></li>
              <li><Check size={15} /> <span><strong>Light plates</strong> — chips, samosas and salads for the table to share.</span></li>
              <li><Check size={15} /> <span><strong>Lunch</strong> in the restaurant, or on the table you are already working at.</span></li>
            </ul>
            <div className="exp-actions">
              <a className="btn-submit-booking-request" href="/dine"><Utensils size={15} /> Open the menu</a>
              <a className="btn-open-slideshow-secondary" href="/unwind"><Beer size={14} /> Evenings &amp; live events</a>
            </div>
          </div>
        </div>
      </section>

      {/* THE BOARD BY RECEPTION — the motel's own designed boards, shown whole inside
          a poster frame rather than cropped into a photograph, exactly as /unwind does
          with the bar's notices. */}
      <section className="mobile-rooms-section">
        <div className="section-head">
          <span className="eyebrow"><span className="eyebrow-line" /> THE BOARD BY RECEPTION</span>
          <h2>What we advertise on our own walls</h2>
          <p>The three boards guests photograph most often, kept here where you can read them properly.</p>
        </div>
        <div className="exp-posters">
          <figure className="exp-poster">
            <SafeImage
              src="/images/connect-coffee-snacks.jpg"
              alt="Sunrise Motel board reading fuel up with Sunrise coffee, stay connected with fast Starlink internet, try our coffee and snacks"
              width={900}
              height={1200}
              fallbackLabel="Coffee and Starlink"
            />
            <figcaption>
              <strong>Coffee &amp; Starlink</strong>
              <small>Our own promise, word for word: fast Starlink internet and a cup of coffee in a quiet, productive space.</small>
            </figcaption>
          </figure>
          <figure className="exp-poster">
            <SafeImage
              src="/images/connect-facilities.jpg"
              alt="Sunrise Motel facilities board listing breakfast, dinner, bar, pool table and Wi-Fi, with the motel telephone number"
              width={642}
              height={800}
              fallbackLabel="Our facilities"
            />
            <figcaption>
              <strong>Our facilities</strong>
              <small>Breakfast, dinner, the bar, the pool table and Wi-Fi — the list on the gate board, in the same order.</small>
            </figcaption>
          </figure>
          <figure className="exp-poster">
            <SafeImage
              src="/images/connect-hospitality-team.jpg"
              alt="Sunrise Motel welcome board introducing the waiting team, with skilled waiters, qualified chefs and expert cleaning staff listed"
              width={687}
              height={800}
              fallbackLabel="The team"
            />
            <figcaption>
              <strong>Welcome to hospitality</strong>
              <small>Skilled waiters, qualified chefs and cleaners — the team that answers when you order a second pot of tea.</small>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* THE WORKSPACE ENQUIRY POPUP */}
      {enquiryOpen && (
        <div
          className="booking-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Enquire about a day workspace or meeting table"
          onClick={(e) => { if (e.target === e.currentTarget) setEnquiryOpen(false); }}
        >
          <div className="booking-modal-sheet">
            <button className="sheet-close-btn" onClick={() => setEnquiryOpen(false)} aria-label="Close the enquiry form"><X size={20} /></button>
            {enquirySent ? (
              <div className="booking-success-view">
                <CheckCircle2 size={36} className="accent-sage" />
                <h3>Enquiry Sent!</h3>
                <p>Our team will prepare a work spot for you.</p>
                <button type="button" className="btn-open-slideshow-secondary" onClick={() => setEnquiryOpen(false)}>Close</button>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); setEnquirySent(true); }} className="form-fields-group">
                <div className="modal-sheet-header">
                  <span className="eyebrow"><span className="eyebrow-line" /> WORKSPACE</span>
                  <h2>Tell us about your day</h2>
                  <p>
                    Starlink Wi-Fi, a plug at the wall and the kitchen open from 07:00. Give us the day and the number of
                    seats and the table is set before you arrive.
                  </p>
                </div>
                <div className="form-grid-2">
                  <input required placeholder="Your Name" />
                  <input required placeholder="WhatsApp Number" />
                </div>
                <div className="form-grid-2">
                  <input type="date" defaultValue={isoPlus(0)} min={isoPlus(0)} aria-label="Which day" />
                  <select defaultValue="1" aria-label="How many seats">
                    <option value="1">1 seat</option>
                    <option value="2">2 seats</option>
                    <option value="4">3 — 4 seats</option>
                    <option value="6">5 - 6 seats · meeting table</option>
                  </select>
                </div>
                <input placeholder="Requirements (e.g. 3 people for 2 hours with coffee)" />
                <button type="submit" className="btn-submit-booking-request">
                  Send Workspace Enquiry <Send size={15} />
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* GOOD TO KNOW — the practical answers, and the way out to the rest of the
          site for anyone who came here for something else. */}
      <section className="mobile-rooms-section">
        <div className="section-head">
          <span className="eyebrow"><span className="eyebrow-line" /> GOOD TO KNOW</span>
          <h2>Before you sit down</h2>
          <p>Four things guests ask us before they open the laptop, answered here.</p>
        </div>
        <div className="exp-facts">
          <div className="exp-fact">
            <span className="exp-fact-icon"><Clock3 size={20} /></span>
            <strong>Open 07:00 — 22:00</strong>
            <small>Every day, breakfast included in that window. The bar and the courtyard run later on happy hour and match days.</small>
          </div>
          <div className="exp-fact">
            <span className="exp-fact-icon"><Banknote size={20} /></span>
            <strong>Pay as you go</strong>
            <small>Cash and mobile money at the bar or the table. Staying with us? Ask for it on the room bill instead.</small>
          </div>
          <div className="exp-fact">
            <span className="exp-fact-icon"><ShieldCheck size={20} /></span>
            <strong>Guest pages &amp; sign-in</strong>
            <small>Staying the night? The front desk opens your guest account at check-in and hands you the email address and password for it.</small>
          </div>
          <div className="exp-fact">
            <span className="exp-fact-icon"><MapPin size={20} /></span>
            <strong>Mzimba Road, Area 5</strong>
            <small>Behind Bwasila Secondary School, Lilongwe. Parking is on the plot, outside the courtyard.</small>
          </div>
        </div>
        <div className="exp-actions">
          <a className="btn-submit-booking-request" href="https://wa.me/265998688332" target="_blank" rel="noreferrer">
            <MessageCircle size={15} /> Ask the desk on WhatsApp
          </a>
          <a className="btn-open-slideshow-secondary" href="/app"><ShieldCheck size={14} /> Guest sign-in</a>
          <a className="btn-open-slideshow-secondary" href="/stay"><BedDouble size={14} /> Stay the night</a>
        </div>
      </section>
    </PageFrame>
  );
}
