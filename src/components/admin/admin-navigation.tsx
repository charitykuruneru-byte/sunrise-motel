"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BedDouble,
  Calendar,
  ChevronDown,
  CreditCard,
  Download,
  FileText,
  Flame,
  History,
  Image as ImageIcon,
  LayoutDashboard,
  Send,
  Utensils,
  Users,
  type LucideIcon,
} from "lucide-react";
import { SunriseLogo } from "@/components/sunrise-logo";

export type AdminSection = "overview" | "bookings" | "invoices" | "gallery" | "posts" | "menu" | "rooms" | "reports";

type Counts = Partial<Record<"bookings" | "invoices" | "gallery" | "posts" | "menu" | "rooms" | "users", number>>;
type ManagementItem = { href: string; label: string; icon: LucideIcon; countKey?: keyof Counts; managerOnly?: boolean };
type SectionItem = { value: AdminSection; label: string; icon: LucideIcon; countKey?: keyof Counts; managerOnly?: boolean; motelOnly?: boolean };

const sections: SectionItem[] = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "bookings", label: "Bookings", icon: Calendar, countKey: "bookings" },
  { value: "invoices", label: "Invoices", icon: FileText, countKey: "invoices" },
  { value: "reports", label: "Reports", icon: Download },
  { value: "gallery", label: "Pictures", icon: ImageIcon, countKey: "gallery" },
  { value: "posts", label: "Posts", icon: Flame, countKey: "posts" },
  { value: "menu", label: "Menu", icon: Utensils, countKey: "menu", managerOnly: true },
  { value: "rooms", label: "Rooms", icon: BedDouble, countKey: "rooms", motelOnly: true },
];

const management: ManagementItem[] = [
  { href: "/admin/audit-logs", label: "Audit trail", icon: History },
  { href: "/admin/users", label: "Users", icon: Users, countKey: "users", managerOnly: true },
  { href: "/admin/notifications", label: "App push", icon: Send },
  { href: "/admin/finance", label: "Finance", icon: CreditCard, managerOnly: true },
  { href: "/admin/calendar", label: "Calendar", icon: Calendar, managerOnly: true },
  { href: "/admin/housekeeping", label: "Housekeeping", icon: BedDouble, managerOnly: true },
];

type AdminNavigationProps = {
  activeSection?: AdminSection;
  onSectionChange?: (section: AdminSection) => void;
  counts?: Counts;
  canViewUsers?: boolean;
  isRestaurantManager?: boolean;
  isMotelManager?: boolean;
};

export function AdminNavigation({
  activeSection,
  onSectionChange,
  counts = {},
  canViewUsers = true,
  isRestaurantManager = true,
  isMotelManager = true,
}: AdminNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const visibleSections = sections.filter((section) =>
    (!("motelOnly" in section) || isMotelManager) &&
    (!("managerOnly" in section) || isRestaurantManager),
  );
  const visibleManagement = management.filter((item) => !("managerOnly" in item) || canViewUsers);
  const currentManagement = visibleManagement.find((item) => item.href === pathname);
  const guestProfile = pathname.startsWith("/admin/guests/");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const currentSection = visibleSections.find((section) => section.value === activeSection)
    ?? visibleSections.find((section) => guestProfile && section.value === "bookings")
    ?? visibleSections[0];
  const currentDestinationLabel = currentManagement?.label ?? currentSection?.label ?? "Navigate";

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileMenuOpen(false);
      mobileTriggerRef.current?.focus();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  const goToSection = (section: AdminSection) => {
    setMobileMenuOpen(false);
    if (onSectionChange) onSectionChange(section);
    else router.push(`/admin?section=${section}`);
  };

  return (
    <>
      <aside
        className="admin-side-nav"
        aria-label="Admin navigation"
      >
        <div className="admin-side-nav-head">
          <span className="admin-side-title">Navigation</span>
          <small>Admin</small>
        </div>

        <div className="admin-side-nav-section">
          <span className="admin-side-section-label">Operations</span>
          {visibleSections.slice(0, 4).map((section) => {
            const Icon = section.icon;
            const count = section.countKey ? counts[section.countKey] : undefined;
            const active = onSectionChange ? activeSection === section.value : guestProfile && section.value === "bookings";
            return onSectionChange ? (
              <button key={section.value} type="button" className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={() => goToSection(section.value)}>
                <Icon size={15} /> {section.label} {count !== undefined && <em>{count}</em>}
              </button>
            ) : (
              <Link key={section.value} href={`/admin?section=${section.value}`}>
                <Icon size={15} /> {section.label} {count !== undefined && <em>{count}</em>}
              </Link>
            );
          })}
        </div>

        <div className="admin-side-nav-section">
          <span className="admin-side-section-label">Property</span>
          {visibleSections.slice(4).map((section) => {
            const Icon = section.icon;
            const count = section.countKey ? counts[section.countKey] : undefined;
            const active = onSectionChange ? activeSection === section.value : guestProfile && section.value === "bookings";
            return onSectionChange ? (
              <button key={section.value} type="button" className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={() => goToSection(section.value)}>
                <Icon size={15} /> {section.label} {count !== undefined && <em>{count}</em>}
              </button>
            ) : (
              <Link key={section.value} href={`/admin?section=${section.value}`}>
                <Icon size={15} /> {section.label} {count !== undefined && <em>{count}</em>}
              </Link>
            );
          })}
        </div>

        <div className="admin-side-nav-section">
          <span className="admin-side-section-label">Management</span>
          {visibleManagement.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            const count = item.countKey ? counts[item.countKey] : undefined;
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
                <Icon size={15} /> {item.label} {count !== undefined && <em>{count}</em>}
              </Link>
            );
          })}
        </div>
      </aside>

      <nav className="admin-mobile-nav" aria-label="Admin navigation">
        <button
          ref={mobileTriggerRef}
          className="admin-mobile-nav-trigger"
          type="button"
          aria-expanded={mobileMenuOpen}
          aria-controls="admin-mobile-destination"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <span>Navigate</span>
          <strong>{currentDestinationLabel}</strong>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
        <div className="admin-mobile-nav-menu" id="admin-mobile-destination" hidden={!mobileMenuOpen}>
          <div className="admin-mobile-nav-group">
            <span>Operations</span>
            {visibleSections.slice(0, 4).map((section) => (
              <button
                key={section.value}
                type="button"
                className={currentSection?.value === section.value ? "active" : ""}
                aria-current={currentSection?.value === section.value ? "page" : undefined}
                onClick={() => goToSection(section.value)}
              >
                {section.label}
                {section.countKey && counts[section.countKey] !== undefined && <em>{counts[section.countKey]}</em>}
              </button>
            ))}
          </div>
          <div className="admin-mobile-nav-group">
            <span>Property</span>
            {visibleSections.slice(4).map((section) => (
              <button
                key={section.value}
                type="button"
                className={currentSection?.value === section.value ? "active" : ""}
                aria-current={currentSection?.value === section.value ? "page" : undefined}
                onClick={() => goToSection(section.value)}
              >
                {section.label}
                {section.countKey && counts[section.countKey] !== undefined && <em>{counts[section.countKey]}</em>}
              </button>
            ))}
          </div>
          <div className="admin-mobile-nav-group">
            <span>Management</span>
            {visibleManagement.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={currentManagement?.href === item.href ? "active" : ""}
                  aria-current={currentManagement?.href === item.href ? "page" : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon size={15} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}

type AdminPageFrameProps = AdminNavigationProps & { children: ReactNode };

export function AdminPageFrame({ children, ...navigationProps }: AdminPageFrameProps) {
  return (
    <>
      <style jsx global>{`
        .admin-frame-header {
          position: sticky;
          top: 0;
          z-index: 50;
        }
        .admin-page-frame .admin-side-nav {
          position: fixed;
          top: 77px;
          height: calc(100vh - 77px);
          height: calc(100dvh - 77px);
          z-index: 40;
        }
        .admin-page-frame .admin-mobile-nav {
          position: sticky;
          top: 77px;
          z-index: 45;
        }
        .admin-page-frame-content .sunrise-app-root > main,
        .admin-page-frame-content > main.admin-page {
          box-sizing: border-box;
          width: 100%;
          max-width: 1320px !important;
          margin-inline: auto !important;
          padding: 28px clamp(16px, 2.4vw, 34px) 64px !important;
        }
        .admin-page-frame-content .hero-headline,
        .admin-page-frame-content .admin-page-header h1 {
          color: var(--ink);
          font-family: var(--serif);
          font-size: clamp(34px, 3.5vw, 48px);
          font-weight: 600;
          letter-spacing: -0.035em;
          line-height: 1.08;
        }
        .admin-page-frame-content .hero-description,
        .admin-page-frame-content .admin-page-header > div > p:last-child {
          max-width: 760px;
          color: var(--muted) !important;
          font-size: 14px;
          line-height: 1.7;
        }
        .admin-page-frame-content .form-fields-group {
          border: 1px solid rgba(23, 21, 19, 0.09);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.82);
          box-shadow: 0 8px 30px rgba(23, 21, 19, 0.035);
        }
        .admin-page-frame-content .manager-kpi-card,
        .admin-page-frame-content .manager-board-column {
          border-color: rgba(23, 21, 19, 0.09) !important;
          border-radius: 18px !important;
          background: rgba(255, 255, 255, 0.82) !important;
          box-shadow: 0 8px 30px rgba(23, 21, 19, 0.035);
        }
        .admin-page-frame-content .manager-board-room {
          border-color: rgba(23, 21, 19, 0.08) !important;
          border-radius: 14px !important;
          box-shadow: 0 4px 14px rgba(23, 21, 19, 0.025);
        }
        .admin-page-frame-content .section-toolbar {
          gap: 16px;
          align-items: center;
        }
        .admin-page-frame-content .section-toolbar h2,
        .admin-page-frame-content .user-section-heading h2 {
          color: var(--ink);
          font-family: var(--serif);
          letter-spacing: -0.02em;
        }
        .admin-page-frame-content .invoice-row,
        .admin-page-frame-content .user-section {
          border-color: rgba(23, 21, 19, 0.09);
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.84);
        }
        .admin-page-frame-content .calendar-grid-scroll {
          border: 1px solid rgba(23, 21, 19, 0.1);
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.9);
          box-shadow: 0 8px 30px rgba(23, 21, 19, 0.035);
        }
        .admin-page-frame-content .admin-btn,
        .admin-page-frame-content .btn-action {
          transition: transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease, border-color 160ms ease;
        }
        .admin-page-frame-content .admin-btn:not(:disabled):hover,
        .admin-page-frame-content .btn-action:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 5px 14px rgba(23, 21, 19, 0.09);
        }
        @media (max-width: 760px) {
          .admin-page-frame-content .sunrise-app-root > main,
          .admin-page-frame-content > main.admin-page {
            padding: 22px 14px 48px !important;
          }
          .admin-page-frame-content .hero-headline,
          .admin-page-frame-content .admin-page-header h1 {
            font-size: clamp(30px, 8vw, 40px);
          }
          .admin-page-frame-content .section-toolbar {
            align-items: flex-start;
            flex-wrap: wrap;
          }
        }
      `}</style>
      <header className="admin-header admin-frame-header">
        <div className="admin-header-left">
          <Link href="/" className="back-link"><ArrowLeft size={15} /> Site</Link>
          <div className="admin-brand">
            <SunriseLogo size="small" animated={false} theme="dark" showTagline={false} />
            <div className="admin-title">
              <span className="admin-badge">MANAGER PORTAL</span>
              <small>Property operations · finance · accountability</small>
            </div>
          </div>
        </div>
        <div className="admin-header-actions">
          <Link className="admin-btn" href="/desk"><LayoutDashboard size={15} /> Front desk console</Link>
        </div>
      </header>
      <div className="admin-page-frame">
        <AdminNavigation {...navigationProps} />
        <div className="admin-page-frame-content">{children}</div>
      </div>
    </>
  );
}