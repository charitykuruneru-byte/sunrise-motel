"use client";

import {
  ArrowLeft,
  BedDouble,
  Bell,
  CalendarDays,
  CreditCard,
  Loader2,
  LogOut,
  MessageSquare,
  Receipt,
  Send,
  Settings,
  Sparkles,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import InstallAppButton from "@/components/install-app";
import { SunriseEmblem } from "@/components/sunrise-logo";
import { WhatsOnFeed, useWhatsOnFeed } from "./whats-on";

type MenuItem = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  imageUrl: string;
  isAvailable: boolean;
  isSpecial: boolean;
};

type Home = {
  signedIn: boolean;
  guest: { guestName: string; email: string | null; phone: string | null; marketingConsent: boolean; status: string };
  stay: {
    bookingId: string;
    reference: string;
    roomNumber: string | null;
    roomType: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    adults: number;
    children: number;
    status: string;
    nightlyRate: number;
    nightsRemaining: number;
    roomState: string | null;
  } | null;
  upcoming: { bookingId: string; reference: string; checkIn: string; checkOut: string; roomType: string; nights: number; status: string }[];
  history: { bookingId: string; reference: string; checkIn: string; checkOut: string; roomType: string; totalAmount: number; status: string }[];
  folio: {
    total: number;
    byCategory: Record<string, number>;
    roomCharge: number;
    ordersCharge: number;
    extrasCharge: number;
    amountPaid: number;
    balanceDue: number;
    items: { id: string; category: string; description: string; qty: number; unitPrice: number; amount: number; status: string; createdAt: string }[];
  };
  invoices: { invoiceNumber: string; totalAmount: number; amountPaid: number; balanceDue: number; status: string; createdAt: string; url: string }[];
  orders: {
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    note: string | null;
    service: string;
    placedAt: string;
    deliveredAt: string | null;
    rejectedReason: string | null;
    items: { id: string; name: string; qty: number; amount: number; status: string }[];
  }[];
  threads: {
    id: string;
    roomNumber: string | null;
    subject: string | null;
    kind: string;
    status: string;
    priority: string;
    lastMessageAt: string;
    resolutionNote: string | null;
    messages: { id: string; direction: string; body: string; kind: string; createdAt: string }[];
  }[];
  requests: { id: string; kind: string; note: string | null; status: string; priority: string; dueBy: string | null; createdAt: string }[];
  menu: MenuItem[];
  service: { open: number; close: number; isOpen: boolean; hour: number };
};

type Tab = "home" | "order" | "whats-on" | "messages" | "bill" | "orders" | "requests" | "settings";

const money = (value: number | null | undefined) => `MWK ${Math.round(value ?? 0).toLocaleString("en-US")}`;

/**
 * THE FIVE BOTTOM TABS (addendum "navigation & image standards", Part 3.1).
 *
 * Home · Order · What's on · Messages · My stay — five is where thumbs stop
 * missing. Orders, requests and settings are still here, but they hang off
 * My stay instead of competing for a tab: that is what "My stay" is for.
 */
const TABS: { id: Tab; label: string; icon: typeof BedDouble }[] = [
  { id: "home", label: "Home", icon: BedDouble },
  { id: "order", label: "Order", icon: UtensilsCrossed },
  { id: "whats-on", label: "What's on", icon: Sparkles },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "bill", label: "My stay", icon: CreditCard },
];

/** Sub-views of My stay — the tab bar keeps My stay lit while they are open. */
const MY_STAY_SUBVIEWS: Tab[] = ["orders", "requests", "settings"];

const QUICK = [
  { kind: "towels", label: "Towels" },
  { kind: "cleaning", label: "Clean the room" },
  { kind: "linen", label: "Fresh linen" },
  { kind: "amenity", label: "Extra pillows / water" },
  { kind: "maintenance", label: "Something is broken" },
  { kind: "taxi", label: "Book a taxi" },
  { kind: "wake_up", label: "Wake-up call" },
  { kind: "late_checkout", label: "Late check-out" },
];

export default function GuestApp() {
  const [loading, setLoading] = useState(true);
  const [home, setHome] = useState<Home | null>(null);
  const [tab, setTabState] = useState<Tab>("home");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [signInError, setSignInError] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [inviteNotice, setInviteNotice] = useState(false);

  const setTab = (nextTab: Tab) => {
    setTabState(nextTab);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === nextTab) return;
    url.searchParams.set("tab", nextTab);
    window.history.pushState({ guestTab: nextTab }, "", url);
  };

  // ---- What's on + the two unread badges (Part 3.1/3.5) --------------------
  // Exactly two tabs carry a badge — What's on and Messages. More than two and
  // badges stop meaning anything. The "seen" markers live on the device only.
  const whatsOn = useWhatsOnFeed();
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    const syncTabFromUrl = () => {
      const wanted = new URLSearchParams(window.location.search).get("tab");
      if (wanted && [...TABS.map((item) => item.id), ...MY_STAY_SUBVIEWS].includes(wanted as Tab)) {
        setTabState(wanted as Tab);
      }
    };
    syncTabFromUrl();
    window.addEventListener("popstate", syncTabFromUrl);
    return () => window.removeEventListener("popstate", syncTabFromUrl);
  }, []);

  const countUnreadMessages = (threads: Home["threads"] | undefined) => {
    let seenAt = 0;
    try {
      seenAt = Number(window.localStorage.getItem("sunrise.messages.seen") ?? 0);
    } catch {
      /* private mode — every thread counts as unread */
    }
    return (threads ?? []).filter((thread) => new Date(thread.lastMessageAt).getTime() > seenAt).length;
  };

  const markMessagesSeen = () => {
    try {
      window.localStorage.setItem("sunrise.messages.seen", String(Date.now()));
    } catch {
      /* nothing to store — the badge simply clears for this session */
    }
    setUnreadMessages(0);
  };

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/guest/me");
      if (response.status === 401) {
        setHome(null);
        return;
      }
      const data = (await response.json()) as Home;
      setHome(data);
      // Badge maths happens here, in the same async refresh that fetched the data —
      // never synchronously in an effect body.
      setUnreadMessages(countUnreadMessages(data.threads));
    } catch {
      setHome(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("signup");
    if (wanted === "1" || wanted === "true" || params.get("message") === "invite-only") {
      setInviteNotice(true);
      setAuthOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const post = async (url: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string; unavailable?: number };
      if (!response.ok) throw new Error(data.error ?? "That did not work.");
      await load();
      return data;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "That did not work.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setSignInError("");
    try {
      const response = await fetch("/api/guest/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password, deviceLabel: navigator.userAgent.slice(0, 120) }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not sign in.");
      setAuthOpen(false);
      await load();
    } catch (error) {
      setSignInError(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--ivory)]">
        <Loader2 className="animate-spin text-[var(--orange-deep)]" />
      </main>
    );
  }

  if (!home) {
    return (
      <main className="guest-app-page min-h-screen bg-[var(--ivory)] px-4 py-10">
        <div className="mx-auto max-w-md space-y-4">
          <div className="rounded-xl border border-[var(--line)] bg-white p-6 shadow-sm">
          <p className="text-[11px] font-black tracking-widest text-[var(--orange-deep)]">SUNRISE MOTEL</p>
          <h1 className="mt-2 text-2xl font-bold">Your room, in your pocket</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            See your room number, follow your room bill, order food to your room and message the front desk.
          </p>

          {/* Accounts are invitation-only; the desk creates a guest account after check-in. */}
          <div className="mt-4 rounded border border-[var(--line)] bg-[var(--ivory)] p-3 text-xs text-[var(--muted)]">
            <p className="font-semibold text-[var(--ink)]">Guest accounts are by invitation</p>
            <p className="mt-1">
              After check-in, the front desk can capture your email and send your secure account setup link.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="admin-btn admin-btn-primary"
                type="button"
                onClick={() => {
                  setSignInError("");
                  setAuthOpen(true);
                }}
              >
                Sign in
              </button>
              <a
                className="admin-btn"
                href={`https://wa.me/265998688332?text=${encodeURIComponent("Hello Sunrise Motel, I would like a guest app account please.")}`}
                target="_blank"
                rel="noreferrer"
              >
                Ask the front desk
              </a>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <a className="admin-btn" href="/track">
              Track a booking
            </a>
            {/* This used to be a link to /download. It opens the install popup on the
                spot now — Install now or Not now, and no screen in between. */}
            <InstallAppButton label="Get the app" />
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            You never need the app to stay with us: track your booking with your reference and phone number, order by
            phone, and settle at the desk. Anyone in the room can also scan the card on the nightstand — no account at
            all.
          </p>
        </div>
        </div>

        {/* THE SIGN-IN / CREATE-ACCOUNT POPUP */}
        {authOpen && (
          <div
            className="booking-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Sign in to your stay"
            onClick={(event) => {
              if (event.target === event.currentTarget) setAuthOpen(false);
            }}
          >
            <div className="booking-modal-sheet">
              <button
                className="sheet-close-btn"
                type="button"
                onClick={() => setAuthOpen(false)}
                aria-label="Close the sign-in window"
              >
                <X size={20} />
              </button>
              <div className="modal-sheet-header">
                <span className="eyebrow"><span className="eyebrow-line" /> WELCOME BACK</span>
                <h2>Sign in</h2>
                <p>Use the email and password for your guest account to see your stay, bill and messages from the desk.</p>
              </div>

              {inviteNotice && (
                <p className="mt-4 rounded border border-[var(--line)] bg-[var(--ivory)] p-3 text-sm text-[var(--muted)]" role="status">
                  Account creation is by invitation only. Contact the front desk after check-in to request your guest setup email.
                </p>
              )}
              <form onSubmit={signIn} className="mt-4 space-y-3">
                <label className="block text-sm font-semibold">
                  Email or phone
                  <input
                    className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 font-normal"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    autoComplete="username"
                    placeholder="you@example.com"
                    required
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Password
                  <input
                    className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 font-normal"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
                {signInError && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{signInError}</p>}
                <button className="admin-btn admin-btn-primary w-full justify-center" type="submit" disabled={busy}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : null} Sign in
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    );
  }
  return (
    <main className="guest-app-page min-h-screen bg-[var(--ivory)] pb-24">
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SunriseEmblem size={26} animated />
            <div>
              <p className="text-[10px] font-black tracking-widest text-[var(--orange-deep)]">SUNRISE MOTEL</p>
              <h1 className="text-sm font-bold">{home.guest.guestName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* The room number is the single most-glanced-at thing in the app, so it
                is pinned in the header and never scrolls away (Part 3.2). */}
            {home.stay?.roomNumber && <span className="app-room-chip">Room {home.stay.roomNumber}</span>}
            <button
              className="rounded-full border border-[var(--line)] p-2"
              type="button"
              onClick={() => setTab("settings")}
              aria-label="Settings"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
        <p className="mx-auto mt-1 max-w-3xl text-right text-[11px] text-[var(--muted)]">
          {home.stay
            ? `${home.stay.checkIn} → ${home.stay.checkOut} · ${home.stay.nightsRemaining} night(s) remaining`
            : "Ask the desk to link your stay"}
        </p>
      </header>

      {toast && (
        <div className="mx-auto mt-3 max-w-3xl px-4">
          <p className="rounded border border-[var(--orange)]/40 bg-[var(--orange-light)] px-3 py-2 text-xs text-[var(--espresso)]">
            {toast}
          </p>
        </div>
      )}

      <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {tab === "home" && (
          <>
            {!home.stay && (
              <section className="rounded-xl border border-[var(--line)] bg-white p-4">
                <h2 className="text-base font-bold">No active stay right now</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  When the front desk links a booking to your account, your room number, your bill and ordering appear
                  here automatically.
                </p>
                {home.upcoming.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Upcoming stays</p>
                    {home.upcoming.map((stay) => (
                      <p key={stay.bookingId} className="rounded border border-[var(--line)] p-2 text-sm">
                        {stay.reference} · {stay.roomType} · {stay.checkIn} → {stay.checkOut} · {stay.status}
                      </p>
                    ))}
                  </div>
                )}
                <Link className="admin-btn admin-btn-primary mt-3 inline-flex" href="/">
                  Book another stay
                </Link>
              </section>
            )}

            {home.stay && (
              <>
                <section className="rounded-xl border border-[var(--line)] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Your room</p>
                      <p className="text-4xl font-black">{home.stay.roomNumber ?? "—"}</p>
                      <p className="text-sm text-[var(--muted)]">
                        {home.stay.roomType} · {home.stay.nights} night(s) · {home.stay.adults} adult(s)
                        {home.stay.children ? ` · ${home.stay.children} child(ren)` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Room bill so far</p>
                      <p className="text-2xl font-bold">{money(home.folio.total)}</p>
                      <p className="text-xs text-[var(--muted)]">
                        paid {money(home.folio.amountPaid)} · balance {money(home.folio.balanceDue)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-[var(--muted)] sm:grid-cols-2">
                    <p>Check-out by 10:00 on {home.stay.checkOut}</p>
                    <p>Starlink Wi-Fi: Sunrise-Guest · password at reception</p>
                    <p>Reference {home.stay.reference}</p>
                    <p>
                      {home.service.isOpen
                        ? `Kitchen open now (until ${String(home.service.close).padStart(2, "0")}:00)`
                        : `Kitchen closed — reopens ${String(home.service.open).padStart(2, "0")}:00`}
                    </p>
                  </div>
                </section>

                <section className="grid gap-3 sm:grid-cols-3">
                  <Stat label="Orders placed" value={`${home.orders.length}`} detail="tap Orders to reorder" />
                  <Stat
                    label="Open requests"
                    value={`${home.requests.filter((r) => r.status !== "done").length}`}
                    detail="housekeeping & maintenance"
                  />
                  <Stat
                    label="Messages"
                    value={`${home.threads.reduce((sum, t) => sum + t.messages.length, 0)}`}
                    detail="private line to the desk"
                  />
                </section>
              </>
            )}
          </>
        )}
        {tab === "order" && <OrderTab home={home} post={post} busy={busy} setToast={setToast} />}

        {/* WHAT'S ON — the same published posts the website shows, images included. */}
        {tab === "whats-on" && (
          <>
            <WhatsOnFeed
              posts={whatsOn.posts}
              loading={whatsOn.loading}
              error={whatsOn.error}
              onRetry={() => void whatsOn.reload()}
            />
          </>
        )}

        {/* MY STAY — the room bill, plus everything else about this stay. Orders,
            requests and settings live one tap in, so the tab bar stays at five. */}
        {tab === "bill" && (
          <>
            <BillTab home={home} />
            <section className="rounded-xl border border-[var(--line)] bg-white p-4">
              <h2 className="text-base font-bold">Everything about this stay</h2>
              <div className="mt-3 grid gap-2">
                <button className="admin-btn justify-between" type="button" onClick={() => setTab("orders")}>
                  <span className="flex items-center gap-2">
                    <Receipt size={15} /> Orders & reorder
                  </span>
                  <span className="text-[var(--muted)]">{home.orders.length}</span>
                </button>
                <button className="admin-btn justify-between" type="button" onClick={() => setTab("requests")}>
                  <span className="flex items-center gap-2">
                    <Bell size={15} /> Requests & housekeeping
                  </span>
                  <span className="text-[var(--muted)]">
                    {home.requests.filter((r) => r.status !== "done").length} open
                  </span>
                </button>
                <button className="admin-btn justify-between" type="button" onClick={() => setTab("messages")}>
                  <span className="flex items-center gap-2">
                    <MessageSquare size={15} /> Messages to the desk
                  </span>
                  <span className="text-[var(--muted)]">{home.threads.length}</span>
                </button>
                <button className="admin-btn justify-between" type="button" onClick={() => setTab("settings")}>
                  <span className="flex items-center gap-2">
                    <Settings size={15} /> Settings & account
                  </span>
                </button>
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">
                Checking out on {home.stay?.checkOut ?? "—"} by 10:00. The desk can arrange a late check-out, a taxi or
                anything else from the Requests screen.
              </p>
            </section>
          </>
        )}

        {tab === "orders" && <SubView title="Orders" onBack={() => setTab("bill")}><OrdersTab home={home} /></SubView>}
        {tab === "requests" && (
          <SubView title="Requests & housekeeping" onBack={() => setTab("bill")}>
            <RequestsTab home={home} post={post} busy={busy} setToast={setToast} />
          </SubView>
        )}
        {tab === "settings" && (
          <SubView title="Settings & account" onBack={() => setTab("bill")}>
            <SettingsTab home={home} reload={load} setToast={setToast} />
          </SubView>
        )}
        {tab === "messages" && <MessagesTab home={home} post={post} busy={busy} />}
      </div>

      {/* FIVE TABS, ALWAYS VISIBLE (Part 3.5) — never hidden behind a scroll.
          The room number stays pinned in the header above, and the badges appear
          on exactly two tabs. */}
      <nav className="app-tabbar" aria-label="Guest app sections">
        {TABS.map((item) => {
          const Icon = item.icon;
          const current = tab === item.id || (item.id === "bill" && MY_STAY_SUBVIEWS.includes(tab));
          const badge = item.id === "whats-on" ? whatsOn.unread : item.id === "messages" ? unreadMessages : 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                if (item.id === "whats-on") whatsOn.markSeen();
                if (item.id === "messages") markMessagesSeen();
              }}
              className={`app-tab ${current ? "is-active" : ""}`}
              aria-current={current ? "page" : undefined}
              aria-label={badge > 0 ? `${item.label}, ${badge} unread` : item.label}
            >
              <Icon size={17} />
              {item.label}
              {badge > 0 && <span className="app-tab-badge badge-pop" aria-hidden="true">{badge > 9 ? "9+" : badge}</span>}
            </button>
          );
        })}
      </nav>
    </main>
  );
}

type Post = (
  url: string,
  body: Record<string, unknown>,
) => Promise<{ error?: string; unavailable?: number } | null>;

/**
 * A sub-view of My stay. It carries its own way back, because "back always works"
 * is a navigation rule, not a nicety (Part 3.5) — including on a deep link.
 */
function SubView({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <button className="admin-btn" type="button" onClick={onBack}>
        <ArrowLeft size={14} /> Back to My stay
      </button>
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

const whenLabel = (value: string) =>
  new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const ORDER_STATUS_TEXT: Record<string, string> = {
  placed: "Sent to the kitchen",
  accepted: "Accepted",
  preparing: "Being prepared",
  ready: "Ready",
  delivered: "Delivered",
  rejected: "Not accepted",
};

const THREAD_STATUS_TEXT: Record<string, string> = {
  open: "With the desk",
  acknowledged: "The desk has seen it",
  in_progress: "Being handled",
  resolved: "Resolved",
  closed: "Closed",
  escalated: "Escalated to the manager",
};

const REQUEST_STATUS_TEXT: Record<string, string> = {
  open: "Logged",
  assigned: "Someone is on it",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

const CATEGORY_LABEL: Record<string, string> = {
  room: "Room nights",
  order: "Food & drinks",
  extras: "Extras",
  late_checkout: "Late check-out",
  damage: "Damage / loss",
  adjustment: "Adjustment",
};

const REQUEST_KINDS = [
  { id: "cleaning", label: "Clean the room" },
  { id: "towels", label: "Towels" },
  { id: "linen", label: "Fresh linen" },
  { id: "amenity", label: "Pillows / water" },
  { id: "maintenance", label: "Something is broken" },
  { id: "taxi", label: "Book a taxi" },
  { id: "wake_up", label: "Wake-up call" },
  { id: "other", label: "Something else" },
];

/** Order from the Dine menu straight to the room (§4.2). */
function OrderTab({
  home,
  post,
  busy,
  setToast,
}: {
  home: Home;
  post: Post;
  busy: boolean;
  setToast: (value: string) => void;
}) {
  const [basket, setBasket] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [service, setService] = useState<"room_service" | "takeaway">("room_service");
  const [category, setCategory] = useState("all");

  const categories = Array.from(new Set(home.menu.map((item) => item.category)));
  const visible = category === "all" ? home.menu : home.menu.filter((item) => item.category === category);
  const lines = home.menu.filter((item) => (basket[item.id] ?? 0) > 0);
  const total = lines.reduce((sum, item) => sum + item.price * (basket[item.id] ?? 0), 0);

  const add = (id: string) => setBasket((prev) => ({ ...prev, [id]: Math.min(20, (prev[id] ?? 0) + 1) }));
  const drop = (id: string) =>
    setBasket((prev) => {
      const next = { ...prev };
      const qty = (next[id] ?? 0) - 1;
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });

  const place = async () => {
    if (!home.stay) {
      setToast("Ordering needs an active stay — ask the front desk to link your booking.");
      return;
    }
    const result = await post("/api/guest/orders", {
      items: lines.map((item) => ({ menuItemId: item.id, qty: basket[item.id] ?? 1 })),
      note,
      service,
    });
    if (!result) return;
    setBasket({});
    setNote("");
    setToast(
      result.unavailable
        ? `Order placed — ${result.unavailable} item(s) were not available and were left off.`
        : "Order placed. The kitchen has it, and it is on your room bill already.",
    );
  };

  return (
    <div className="space-y-4">
      {home.stay ? (
        <section className="rounded-xl border border-[var(--line)] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Delivering to</p>
              <p className="text-lg font-bold">{home.stay.roomNumber ? `Room ${home.stay.roomNumber}` : "Your room"}</p>
            </div>
            <p className="text-right text-[11px] text-[var(--muted)]">
              {home.service.isOpen
                ? `Kitchen open until ${String(home.service.close).padStart(2, "0")}:00`
                : `Kitchen closed — reopens ${String(home.service.open).padStart(2, "0")}:00`}
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-[var(--line)] bg-white p-4 text-sm text-[var(--muted)]">
          Room ordering opens once the desk has linked your booking. In the meantime call the front desk on
          +265 998 688 332 and they will take your order.
        </section>
      )}

      <div className="flex gap-1 overflow-x-auto pb-1">
        {["all", ...categories].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
              category === item
                ? "border-[var(--orange)] bg-[var(--orange-light)] text-[var(--orange-deep)]"
                : "border-[var(--line)] bg-white text-[var(--muted)]"
            }`}
          >
            {item === "all" ? "Everything" : item}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {visible.map((item) => (
          <div key={item.id} className="rounded-xl border border-[var(--line)] bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold">
                  {item.name}
                  {item.isSpecial ? (
                    <span className="ml-1 text-[10px] font-bold text-[var(--orange-deep)]">· SPECIAL</span>
                  ) : null}
                </p>
                {item.description && <p className="text-[11px] text-[var(--muted)]">{item.description}</p>}
              </div>
              <p className="shrink-0 text-sm font-semibold">{money(item.price)}</p>
            </div>
            <div className="mt-2 flex items-center gap-2">
              {item.isAvailable ? (
                <>
                  {(basket[item.id] ?? 0) > 0 && (
                    <>
                      <button className="admin-btn" type="button" onClick={() => drop(item.id)}>
                        −
                      </button>
                      <span className="min-w-6 text-center text-sm font-bold">{basket[item.id]}</span>
                    </>
                  )}
                  <button className="admin-btn admin-btn-primary" type="button" onClick={() => add(item.id)}>
                    {basket[item.id] ? "Add one more" : "Add"}
                  </button>
                </>
              ) : (
                <span className="text-[11px] font-semibold text-[var(--muted)]">Not available today</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-[var(--line)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Your tray</p>
        {lines.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--muted)]">Nothing yet — tap Add on anything you fancy.</p>
        ) : (
          <>
            <div className="mt-2 space-y-1">
              {lines.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span>
                    {basket[item.id]}× {item.name}
                  </span>
                  <span className="font-semibold">{money(item.price * (basket[item.id] ?? 0))}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-[var(--line)] pt-2 text-sm font-bold">
              <span>Total</span>
              <span>{money(total)}</span>
            </div>
            <div className="mt-3 grid gap-2">
              <label className="text-xs font-semibold">
                Note for the kitchen (allergies, no chilli…)
                <input
                  className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 text-sm font-normal"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <div className="flex gap-1">
                {(["room_service", "takeaway"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setService(option)}
                    className={`flex-1 rounded border px-3 py-1.5 text-xs font-semibold ${
                      service === option
                        ? "border-[var(--orange)] bg-[var(--orange-light)]"
                        : "border-[var(--line)] bg-white text-[var(--muted)]"
                    }`}
                  >
                    {option === "room_service" ? "Bring it to my room" : "I will collect it"}
                  </button>
                ))}
              </div>
              <button
                className="admin-btn admin-btn-primary justify-center"
                type="button"
                onClick={place}
                disabled={busy || !home.stay || !home.service.isOpen}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <UtensilsCrossed size={14} />} Place order ·{" "}
                {money(total)}
              </button>
              <p className="text-[11px] text-[var(--muted)]">
                The total is posted to your room bill — nothing is charged to a card here. Settle at check-out.
              </p>
            </div>
          </>
        )}
      </section>

      </div>
  );
}

/** Every order this guest placed, with its live status (§3). */
function OrdersTab({ home }: { home: Home }) {
  if (home.orders.length === 0) {
    return (
      <section className="rounded-xl border border-[var(--line)] bg-white p-4">
        <h2 className="text-base font-bold">No orders yet</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Order from the Dine menu and it will appear here, with its progress from the kitchen to your door.
        </p>
      </section>
    );
  }
  return (
    <div className="space-y-2">
      {home.orders.map((order) => (
        <section key={order.id} className="rounded-xl border border-[var(--line)] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold">{order.orderNumber}</p>
              <p className="text-[11px] text-[var(--muted)]">
                {order.service === "takeaway" ? "Collect at the kitchen" : "Room service"} · {whenLabel(order.placedAt)}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                order.status === "rejected"
                  ? "bg-red-100 text-red-700"
                  : order.status === "delivered"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-[var(--ivory-deep)]"
              }`}
            >
              {ORDER_STATUS_TEXT[order.status] ?? order.status}
            </span>
          </div>
          <div className="mt-2 space-y-1 text-sm">
            {order.items.map((line) => (
              <div key={line.id} className="flex justify-between">
                <span>
                  {line.qty}× {line.name}
                </span>
                <span>{money(line.amount)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t border-[var(--line)] pt-2 text-sm font-bold">
            <span>Total</span>
            <span>{money(order.total)}</span>
          </div>
          {order.note && <p className="mt-2 text-[11px] text-[var(--muted)]">Your note: {order.note}</p>}
          {order.rejectedReason && (
            <p className="mt-2 text-[11px] text-red-700">Not accepted: {order.rejectedReason}</p>
          )}
          {order.deliveredAt && (
            <p className="mt-1 text-[11px] text-[var(--muted)]">Delivered {whenLabel(order.deliveredAt)}</p>
          )}
        </section>
      ))}
    </div>
  );
}

/** The running room bill — the same folio the front desk sees (§10). */
function BillTab({ home }: { home: Home }) {
  const folio = home.folio;
  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-[var(--line)] bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Balance due at check-out</p>
        <p className="text-3xl font-black">{money(folio.balanceDue)}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded border border-[var(--line)] p-2">
            <p className="text-[var(--muted)]">Bill</p>
            <p className="font-bold">{money(folio.total)}</p>
          </div>
          <div className="rounded border border-[var(--line)] p-2">
            <p className="text-[var(--muted)]">Paid</p>
            <p className="font-bold">{money(folio.amountPaid)}</p>
          </div>
          <div className="rounded border border-[var(--line)] p-2">
            <p className="text-[var(--muted)]">Room nights</p>
            <p className="font-bold">{money(folio.roomCharge)}</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-[var(--muted)]">
          Pay at the desk by cash, card, Airtel Money or TNM Mpamba. Bank transfer details are printed on your invoice.
        </p>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Charges on your room</p>
        {folio.items.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--muted)]">
            Nothing charged yet. Room nights are posted by the desk when you check in.
          </p>
        ) : (
          <div className="mt-1 divide-y divide-[var(--line)]">
            {folio.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="font-semibold">{item.description}</p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {CATEGORY_LABEL[item.category] ?? item.category}
                    {item.qty > 1 ? ` · ${item.qty} × ${money(item.unitPrice)}` : ""} · {whenLabel(item.createdAt)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold">{money(item.amount)}</p>
                  {item.status !== "open" && (
                    <p className="text-[10px] uppercase text-[var(--muted)]">{item.status}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--muted)]">
          <span className="rounded bg-[var(--ivory-deep)] px-2 py-0.5">Room nights {money(folio.roomCharge)}</span>
          <span className="rounded bg-[var(--ivory-deep)] px-2 py-0.5">Food & drinks {money(folio.ordersCharge)}</span>
          <span className="rounded bg-[var(--ivory-deep)] px-2 py-0.5">Extras {money(folio.extrasCharge)}</span>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Invoices & receipts</p>
        {home.invoices.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--muted)]">Your pro-forma appears here as soon as the desk raises it.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {home.invoices.map((invoice) => (
              <div
                key={invoice.invoiceNumber}
                className="flex items-center justify-between gap-3 rounded border border-[var(--line)] p-2 text-sm"
              >
                <div>
                  <p className="font-semibold">{invoice.invoiceNumber}</p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {whenLabel(invoice.createdAt)} · {invoice.status} · balance {money(invoice.balanceDue)}
                  </p>
                </div>
                <a className="admin-btn" href={invoice.url} target="_blank" rel="noreferrer">
                  <Receipt size={14} /> PDF
                </a>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** The private line between the guest and the front desk (§5). */
function MessagesTab({ home, post, busy }: { home: Home; post: Post; busy: boolean }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState("message");

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    const result = await post("/api/guest/messages", { body, kind });
    if (result) {
      setText("");
      setKind("message");
    }
  };

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-[var(--line)] bg-white p-3 text-[11px] text-[var(--muted)]">
        This line is private between you and the front desk, and your room number is attached automatically. In an
        emergency call +265 998 688 332 rather than waiting for a reply here.
      </section>

      {home.threads.length === 0 && (
        <section className="rounded-xl border border-[var(--line)] bg-white p-4 text-sm text-[var(--muted)]">
          No messages yet. Ask for anything — an extra towel, a late check-out, or tell us about a problem.
        </section>
      )}

      {home.threads.map((thread) => (
        <section key={thread.id} className="rounded-xl border border-[var(--line)] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold">{thread.subject ?? "Conversation with the desk"}</p>
              <p className="text-[11px] text-[var(--muted)]">
                {thread.roomNumber ? `Room ${thread.roomNumber}` : "No room attached"} · last message{" "}
                {whenLabel(thread.lastMessageAt)}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                thread.priority === "emergency" ? "bg-red-100 text-red-700" : "bg-[var(--ivory-deep)]"
              }`}
            >
              {THREAD_STATUS_TEXT[thread.status] ?? thread.status}
            </span>
          </div>
          {thread.resolutionNote && (
            <p className="mt-2 rounded border border-[var(--line)] bg-[var(--ivory)] p-2 text-[11px]">
              Resolution: {thread.resolutionNote}
            </p>
          )}
          <div className="mt-3 space-y-2">
            {thread.messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  message.direction === "desk_to_guest" ? "bg-[var(--ivory)]" : "ml-auto bg-[var(--orange-light)]"
                }`}
              >
                <p>{message.body}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                  {message.direction === "desk_to_guest" ? "Front desk" : "You"} · {whenLabel(message.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="rounded-xl border border-[var(--line)] bg-white p-4">
        <div className="flex flex-wrap gap-1">
          {[
            { id: "message", label: "Message" },
            { id: "complaint", label: "Complaint" },
            { id: "emergency", label: "Emergency" },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setKind(option.id)}
              className={`rounded border px-3 py-1 text-xs font-semibold ${
                kind === option.id
                  ? option.id === "emergency"
                    ? "border-red-400 bg-red-50 text-red-700"
                    : "border-[var(--orange)] bg-[var(--orange-light)]"
                  : "border-[var(--line)] bg-white text-[var(--muted)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <textarea
          className="mt-2 w-full rounded border border-[var(--line)] px-3 py-2 text-sm"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your message…"
        />
        <button
          className="admin-btn admin-btn-primary mt-2"
          type="button"
          onClick={send}
          disabled={busy || !text.trim()}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send to the front desk
        </button>
      </section>
    </div>
  );
}

/** One-tap housekeeping, maintenance and taxi requests (§6). */
function RequestsTab({
  home,
  post,
  busy,
  setToast,
}: {
  home: Home;
  post: Post;
  busy: boolean;
  setToast: (value: string) => void;
}) {
  const [note, setNote] = useState("");
  const [kind, setKind] = useState("cleaning");
  const [urgent, setUrgent] = useState(false);

  const send = async (requestKind: string, priority: "normal" | "urgent") => {
    const result = await post("/api/guest/requests", {
      kind: requestKind,
      note: requestKind === kind ? note : "",
      priority,
    });
    if (!result) return;
    setNote("");
    setUrgent(false);
    setToast("Request logged — housekeeping can see it on your room now.");
  };

  const open = home.requests.filter((request) => request.status !== "done" && request.status !== "cancelled");

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-[var(--line)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">One tap</p>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          {home.stay?.roomNumber
            ? `These go to Room ${home.stay.roomNumber} — no need to type anything.`
            : "Ask the desk to link your stay and requests will reach your room automatically."}
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {QUICK.map((item) => (
            <button
              key={item.kind}
              className="admin-btn justify-center"
              type="button"
              disabled={busy}
              onClick={() => void send(item.kind, item.kind === "maintenance" ? "urgent" : "normal")}
            >
              <Bell size={14} /> {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Something specific</p>
        <div className="mt-2 grid gap-2">
          <label className="text-xs font-semibold">
            What do you need?
            <select
              className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 text-sm font-normal"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {REQUEST_KINDS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold">
            Anything we should know?
            <textarea
              className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 text-sm font-normal"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. please come before 14:00, the tap is dripping"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            This cannot wait — tell the desk it is urgent
          </label>
          <button
            className="admin-btn admin-btn-primary justify-center"
            type="button"
            disabled={busy}
            onClick={() => void send(kind, urgent ? "urgent" : "normal")}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />} Send request
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
          Your requests {open.length > 0 ? `(${open.length} open)` : ""}
        </p>
        {home.requests.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--muted)]">Nothing requested yet.</p>
        ) : (
          <div className="mt-1 divide-y divide-[var(--line)]">
            {home.requests.map((request) => (
              <div key={request.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="font-semibold capitalize">{request.kind.replace("_", " ")}</p>
                  <p className="text-[11px] text-[var(--muted)]">
                    Asked {whenLabel(request.createdAt)}
                    {request.dueBy ? ` · due by ${whenLabel(request.dueBy)}` : ""}
                  </p>
                  {request.note && <p className="text-[11px] text-[var(--muted)]">{request.note}</p>}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    request.priority === "emergency" || request.priority === "urgent"
                      ? "bg-red-100 text-red-700"
                      : request.status === "done"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-[var(--ivory-deep)]"
                  }`}
                >
                  {REQUEST_STATUS_TEXT[request.status] ?? request.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Profile, password, preferences and sign-out (§2.3). */
function SettingsTab({
  home,
  reload,
  setToast,
}: {
  home: Home;
  reload: () => Promise<void>;
  setToast: (value: string) => void;
}) {
  const [phone, setPhone] = useState(home.guest.phone ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [consent, setConsent] = useState(home.guest.marketingConsent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const patch = async (body: Record<string, unknown>, okMessage: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/guest/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string; signedOutEverywhere?: boolean };
      if (!response.ok) throw new Error(data.error ?? "Could not save that.");
      if (data.signedOutEverywhere) {
        window.location.assign("/");
        return;
      }
      setToast(okMessage);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async (all: boolean) => {
    await fetch(`/api/guest/auth${all ? "?all=1" : ""}`, { method: "DELETE" });
    window.location.assign("/");
  };

  return (
    <div className="space-y-3">
      {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <section className="rounded-xl border border-[var(--line)] bg-white p-4 text-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Your account</p>
        <p className="mt-1 font-bold">{home.guest.guestName}</p>
        <p className="text-[11px] text-[var(--muted)]">
          {home.guest.email ?? "No email on file"} · {home.guest.phone ?? "No phone on file"}
        </p>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          Status {home.guest.status}
          {home.stay?.roomNumber ? ` · currently Room ${home.stay.roomNumber}` : ""}
        </p>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Phone number</p>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          Used for receipts and arrival reminders. Never shared outside the motel.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            className="w-full rounded border border-[var(--line)] px-3 py-2 text-sm"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+265 99 000 0000"
          />
          <button
            className="admin-btn admin-btn-primary justify-center"
            type="button"
            disabled={busy || !phone.trim()}
            onClick={() => void patch({ phone }, "Phone number saved.")}
          >
            Save
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Password</p>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          Changing your password signs you out on every device, including this one. Use at least 8 characters.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            className="rounded border border-[var(--line)] px-3 py-2 text-sm"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password"
          />
          <input
            className="rounded border border-[var(--line)] px-3 py-2 text-sm"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
          />
        </div>
        <button
          className="admin-btn admin-btn-primary mt-2"
          type="button"
          disabled={busy || !currentPassword || newPassword.trim().length < 8}
          onClick={() => void patch({ currentPassword, newPassword }, "Password changed.")}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : null} Change password
        </button>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Offers & event news</p>
        <label className="mt-2 flex items-start gap-2 text-xs">
          <input className="mt-0.5" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            Email or text me about braai days, happy hour and seasonal offers. This is separate from service messages
            about your stay — those always arrive.
          </span>
        </label>
        <button
          className="admin-btn admin-btn-primary mt-2"
          type="button"
          disabled={busy || consent === home.guest.marketingConsent}
          onClick={() => void patch({ marketingConsent: consent }, consent ? "You are opted in — thank you." : "You are opted out.")}
        >
          Save preference
        </button>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Your stays with us</p>
        {home.history.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--muted)]">No completed stays yet — this fills up as you visit.</p>
        ) : (
          <div className="mt-1 divide-y divide-[var(--line)]">
            {home.history.map((stay) => (
              <div key={stay.bookingId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="font-semibold">{stay.reference}</p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {stay.roomType} · {stay.checkIn} → {stay.checkOut} · {stay.status}
                  </p>
                </div>
                <span className="text-[11px] font-semibold">{money(stay.totalAmount)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Sign out</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="admin-btn" type="button" onClick={() => void signOut(false)}>
            <LogOut size={14} /> Sign out on this device
          </button>
          <button className="admin-btn" type="button" onClick={() => void signOut(true)}>
            <LogOut size={14} /> Sign out everywhere
          </button>
          <a className="admin-btn" href="/track">
            <CalendarDays size={14} /> Track a booking
          </a>
        </div>
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Lost your phone? Sign out everywhere, then ask the front desk to send a fresh invitation. The motel number is
          +265 998 688 332.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[11px] text-[var(--muted)]">{detail}</p>
    </div>
  );
}

