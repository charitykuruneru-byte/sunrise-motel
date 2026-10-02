"use client";

import {
  BedDouble,
  BriefcaseBusiness,
  CalendarCheck,
  Home,
  Layers,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  Smartphone,
  Utensils,
  Waves,
  Wifi,
  X,
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SunriseLogo } from "@/components/sunrise-logo";
import { MealAlertBell } from "@/components/meal-notifications";

/**
 * THE SITE NAVIGATION — three tiers, not one flat row.
 * (addendum "navigation & image standards", Part 2)
 *
 *  Tier 1  utility bar     front desk · get the app · manager portal
 *  Tier 2  primary nav     Home · Stay · Dine · Unwind · Connect · Gallery
 *                          — six items, and the two brand names that mean
 *                          nothing to a stranger ("Unwind", "Connect") carry
 *                          a descriptor underneath on desktop.
 *  Tier 3  action cluster  Check availability (button) · Track booking (link)
 *
 * Rules encoded here: relative links only (no localhost:3000 in a link, ever),
 * the current page is marked, the logo links home but the Home label still
 * exists, exactly one primary button per view, the manager portal is a text
 * link and never competes with Check availability, and on mobile a sticky bar
 * keeps the booking one tap away from anywhere on the page.
 */

export const WHATSAPP_NUMBER = "265998688332";
export const whatsappLink = (message: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
export const WHATSAPP_DEFAULT = whatsappLink("Hello Sunrise Motel, I would like to make an enquiry.");

type NavItem = { label: string; href: string; sub?: string; icon: typeof Home };

const PRIMARY: NavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Stay", href: "/stay", sub: "Rooms & availability", icon: BedDouble },
  { label: "Dine", href: "/menu", sub: "Restaurant & live menu", icon: Utensils },
  { label: "Unwind", href: "/unwind", sub: "Events, braai & lounge", icon: Waves },
  { label: "Connect", href: "/connect", sub: "Wi-Fi & workspace", icon: Wifi },
  { label: "Gallery", href: "/gallery", icon: Layers },
];

export default function SiteNav({
  active,
  bookingHref = "/#rooms-section",
  showStickyBar = true,
}: {
  /** Which primary item is the current page, e.g. "Stay". */
  active?: string;
  /** Where "Check availability" points — the search on this page when there is one. */
  bookingHref?: string;
  showStickyBar?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const resolvedActive = (() => {
    if (active) return active;
    if (!pathname || pathname === "/") return "Home";
    const clean = pathname.split("/")[1];
    const match = PRIMARY.find((item) => {
      const route = item.href.split("/")[1] ?? "";
      return route && route === clean;
    });
    return match?.label ?? "Home";
  })();

  const closeMenu = () => setOpen(false);

  return (
    <div className="site-nav-root">
      {/* ---------------- TIER 1 — utility bar ---------------- */}
      <div className="mobile-top-utility">
        <div className="utility-container">
          <a href="tel:+265998688332" className="utility-link">
            <Phone size={12} className="accent-orange" /> +265 998 688 332
          </a>
          <span className="utility-item utility-location">
            <MapPin size={12} className="accent-orange" /> Area 5, Lilongwe
          </span>
          <div className="utility-right">
            <a href="/app" className="utility-link">
              <Smartphone size={12} className="accent-orange" /> Get the app
            </a>
          </div>
        </div>
      </div>

      {/* ---------------- TIER 2 — primary navigation + action cluster ---------------- */}
      <header className="mobile-main-header">
        <div className="header-inner site-header-inner">
          {/* The logo always links home — but the Home *label* still exists in the
              primary row, so the logo is never the only way back (Part 2.6). */}
          <Link href="/" className="header-logo-link" aria-label="Sunrise Motel home">
            <SunriseLogo size="small" animated theme="dark" />
          </Link>

          <nav className={`header-nav-menu site-primary-nav ${open ? "is-visible" : ""}`} aria-label="Main navigation">
            {PRIMARY.map((item) => {
              const Icon = item.icon;
              const isActive = resolvedActive === item.label;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`site-nav-item ${isActive ? "is-active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={closeMenu}
                >
                  <span className="nav-item-main">
                    <Icon size={16} /> {item.label}
                  </span>
                  {item.sub && <small className="nav-item-sub">{item.sub}</small>}
                </Link>
              );
            })}

            {/* Utilities belong in the drawer, never in the primary row */}
            <span className="nav-divider" aria-hidden="true" />
            <Link href="/track" className={`nav-utility-link ${resolvedActive === "Track" ? "is-active" : ""}`} onClick={closeMenu}>
              <Search size={15} /> Track booking
            </Link>
            <Link href="/app" className="nav-utility-link" onClick={closeMenu}>
              <Smartphone size={15} /> Get the app
            </Link>
            <Link href="/room" className="nav-utility-link" onClick={closeMenu}>
              <BriefcaseBusiness size={15} /> Order to your room
            </Link>
            <Link href="/admin" className="nav-utility-link admin-nav-link" onClick={closeMenu}>
              <ShieldCheck size={15} /> Manager portal
            </Link>
            <span className="nav-divider" aria-hidden="true" />
            <div className="nav-drawer-contact">
              <a href="tel:+265998688332">
                <Phone size={15} /> Call the front desk
              </a>
              <a className="drawer-whatsapp" href={WHATSAPP_DEFAULT} target="_blank" rel="noreferrer">
                <MessageCircle size={15} /> Chat on WhatsApp
              </a>
            </div>
          </nav>

          <div className="header-right-actions">
            <MealAlertBell />
            <Link href={bookingHref} className="btn-check-availability" onClick={closeMenu}>
              <CalendarCheck size={15} /> Check availability
            </Link>
            <Link href="/track" className="header-track-link" onClick={closeMenu}>
              <Search size={14} /> Track booking
            </Link>
            <a href={WHATSAPP_DEFAULT} target="_blank" rel="noreferrer" className="btn-whatsapp-header">
              <MessageCircle size={16} /> <span>WhatsApp</span>
            </a>
            <button
              className="menu-toggle-btn"
              onClick={() => setOpen((value) => !value)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>

      {/* ---------------- Mobile sticky action bar ---------------- */}
      {showStickyBar && (
        <div className="site-sticky-bar">
          <Link href={bookingHref} className="site-sticky-primary" onClick={closeMenu}>
            <CalendarCheck size={16} /> Check availability
          </Link>
          <a
            className="site-sticky-whatsapp"
            href={whatsappLink("Hello Sunrise Motel, I would like to check availability.")}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={16} /> WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}
