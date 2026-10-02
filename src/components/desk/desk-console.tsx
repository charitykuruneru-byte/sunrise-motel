"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BedDouble,
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChefHat,
  CreditCard,
  Key,
  Loader2,
  LogOut,
  MessageSquare,
  RefreshCw,
  Star,
  QrCode,
  Receipt,
  Users,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import DeskGuests from "./desk-guests";
import DeskIssues from "./desk-issues";
import DeskMenu from "./desk-menu";
import DeskMoney from "./desk-money";
import DeskOrders from "./desk-orders";
import DeskReviews from "./desk-reviews";
import DeskRoomAccess from "./desk-roomaccess";
import DeskRooms from "./desk-rooms";
import DeskTasks from "./desk-tasks";
import { ageLabel, api, BTN, BTN_PRIMARY, CARD, money } from "./shared";

type Tab = "today" | "rooms" | "access" | "orders" | "issues" | "tasks" | "menu" | "money" | "guests" | "reviews";

export type RoomSummary = {
  id: string;
  roomNumber: string;
  roomType: string;
  floor: string | null;
  state: string;
  occupant: {
    bookingId: string;
    reference: string;
    guestName: string;
    checkIn: string;
    checkOut: string;
    status: string;
    appAccount: string | null;
  } | null;
};

type Overview = {
  today: string;
  actionCentre: {
    paymentsToVerify: {
      count: number;
      amount: number;
      oldest: { reference: string | null; amount: number; channel: string; payerName: string | null } | null;
    };
    unassignedArrivals: {
      count: number;
      list: { id: string; reference: string; guestName: string; roomType: string; checkIn: string }[];
    };
    emergencies: { count: number; room: string | null; subject: string | null; guestName: string | null };
    complaints: {
      count: number;
      oldestMinutes: number;
      oldest: { guestName: string | null; room: string | null; subject: string | null } | null;
    };
    escalatedBookings: { count: number };
    ordersWaiting: {
      count: number;
      oldestMinutes: number;
      oldest: { orderNumber: string; guestName: string | null; roomNumber: string | null; status: string } | null;
    };
    openTasks: {
      count: number;
      overdue: number;
      oldestOverdue: { roomNumber: string; kind: string; note: string | null; assignedTo: string | null } | null;
    };
  };
  kpis: {
    occupancy: number; adr: number; revpar: number; roomsSoldToday: number; sellableRooms: number;
    outOfOrder: number; arrivals: number; departures: number; unassigned: number; inHouse: number;
    revenueToday: number; revenueWeek: number; revenueMonth: number; collected: number;
    collectedByChannel: Record<string, number>; outstanding: number; unverifiedPayments: number;
    openOrders: number; openIssues: number; openTasks: number;
  };
  arrivals: {
    id: string; reference: string; guestName: string; phone: string; email: string | null; roomType: string;
    nights: number; adults: number; children: number; status: string; totalAmount: number; amountPaid: number;
    roomNumber: string | null; guestId: string | null; arrival: string | null; requests: string | null;
  }[];
  departures: {
    id: string; reference: string; guestName: string; roomNumber: string | null;
    totalAmount: number; amountPaid: number; status: string;
  }[];
  inHouse: {
    id: string; reference: string; guestName: string; phone: string; roomNumber: string | null;
    checkIn: string; checkOut: string; balance: number; guestId: string | null;
  }[];
  roomStates: Record<string, number>;
  outOfOrderRooms: { roomNumber: string; reason: string | null; until: string | null }[];
};

type SessionUser = { id: string; staffCode: string; name: string; email: string; role: string };

const TABS: { id: Tab; label: string; icon: typeof BedDouble }[] = [
  { id: "today", label: "Today", icon: BellRing },
  { id: "rooms", label: "Room map", icon: BedDouble },
  { id: "access", label: "Room access", icon: QrCode },
  { id: "orders", label: "Orders", icon: UtensilsCrossed },
  { id: "issues", label: "Messages & issues", icon: MessageSquare },
  { id: "tasks", label: "Housekeeping", icon: Wrench },
  { id: "menu", label: "Menu availability", icon: ChefHat },
  { id: "money", label: "Payments & folios", icon: CreditCard },
  { id: "guests", label: "Guests", icon: Users },
  { id: "reviews", label: "Reviews & waitlist", icon: Star },
];

const NAV_GROUPS: { label: string; tabs: Tab[] }[] = [
  { label: "Daily work", tabs: ["today", "rooms", "access", "tasks"] },
  { label: "Guest service", tabs: ["orders", "issues", "menu", "guests", "reviews"] },
  { label: "Payments", tabs: ["money"] },
];

const WORKSPACE_HELP: Record<Tab, string> = {
  today: "A clear overview of arrivals, departures and anything that needs attention.",
  rooms: "Check room status, assign rooms and update a guest’s stay.",
  access: "Create or manage guest access to the room services.",
  orders: "Review incoming food orders and keep guests updated.",
  issues: "Respond to guest messages, requests and reported problems.",
  tasks: "Coordinate cleaning, room preparation and maintenance.",
  menu: "Temporarily mark menu items unavailable when needed.",
  money: "Record payments, check balances and review room bills.",
  guests: "Find guest details and manage guest-app invitations.",
  reviews: "Follow up on guest feedback and manage the waitlist.",
};

export default function DeskConsole() {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [toast, setToast] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);

  // Deep links from the other screens: /desk?tab=access, ?tab=reviews, ?tab=orders …
  // Applied after mount so the server-rendered markup and the first client render agree.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted && TABS.some((item) => item.id === wanted)) setTab(wanted as Tab);
  }, []);

  useEffect(() => {
    const restoreTabFromHistory = () => {
      const wanted = new URLSearchParams(window.location.search).get("tab");
      if (wanted && TABS.some((item) => item.id === wanted)) setTab(wanted as Tab);
    };
    window.addEventListener("popstate", restoreTabFromHistory);
    return () => window.removeEventListener("popstate", restoreTabFromHistory);
  }, []);

  const navigateToTab = (nextTab: Tab) => {
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.pushState({ deskTab: nextTab }, "", url);
  };

  const isReadOnly = user?.role === "auditor";
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isMotelManager = isAdmin || user?.role === "motel_manager";
  const isRestaurantManager = isAdmin || user?.role === "restaurant_manager";

  const loadOverview = useCallback(async () => {
    const [data, roomData] = await Promise.all([
      api<Overview>("/api/desk/overview"),
      api<{ rooms: RoomSummary[] }>("/api/desk/rooms"),
    ]);
    setOverview(data);
    setRooms(roomData.rooms);
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const data = await api<{ authed: boolean; user: SessionUser | null }>("/api/admin/login");
      setUser(data.authed ? data.user : null);
      if (data.authed) await loadOverview();
    } catch {
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, [loadOverview]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 7000);
    return () => clearTimeout(timer);
  }, [toast]);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setLoginError("");
    try {
      const data = await api<{ success: boolean; user: SessionUser }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify(email ? { email, password } : { password }),
      });
      setUser(data.user);
      await loadOverview();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    setUser(null);
    setOverview(null);
  };

  const refresh = async () => {
    setBusy(true);
    try {
      await loadOverview();
      setToast("Board refreshed.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Refresh failed.");
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#12100e] text-white">
        <Loader2 className="animate-spin" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="desk-login-shell flex min-h-screen flex-col items-center justify-center bg-[#f5f2ed] p-5 text-[#2b241f]">
        <form onSubmit={signIn} className="w-full max-w-md space-y-5 rounded-2xl border border-[#30251d]/10 bg-white p-6 shadow-xl sm:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-[#fff1df] p-3 text-[#a4540d]">
              <Key size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9a5a20]">Sunrise Motel</p>
              <h1 className="mt-1 text-xl font-bold tracking-tight">Welcome to the front desk</h1>
              <p className="mt-2 text-sm leading-relaxed text-[#71675f]">
                Sign in with your staff account. The manager password can also be used.
              </p>
            </div>
          </div>
          <label className="grid gap-1.5 text-sm font-semibold text-[#4a4038]">
            Staff email <span className="font-normal text-[#877b70]">(optional)</span>
            <input
              className="min-h-11 rounded-lg border border-[#30251d]/20 bg-[#faf8f5] px-3 text-sm text-[#2b241f] outline-none placeholder:text-[#a0968d] focus:border-[#d5781a] focus:ring-2 focus:ring-[#f28c18]/20"
              type="email"
              autoComplete="username"
              placeholder="staff@sunrisemotel.mw"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-[#4a4038]">
            Password
            <input
              className="min-h-11 rounded-lg border border-[#30251d]/20 bg-[#faf8f5] px-3 text-sm text-[#2b241f] outline-none placeholder:text-[#a0968d] focus:border-[#d5781a] focus:ring-2 focus:ring-[#f28c18]/20"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {loginError && (
            <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{loginError}</p>
          )}
          <button className={`${BTN_PRIMARY} min-h-11 w-full justify-center rounded-lg text-sm`} disabled={busy} type="submit">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />} Sign in
          </button>
          <Link href="/" className="block text-center text-xs font-semibold text-[#9a5a20] hover:underline">
            Return to Sunrise Motel website
          </Link>
        </form>
      </main>
    );
  }

  const action = overview?.actionCentre;

  return (
    <Shell
      user={user}
      today={overview?.today ?? null}
      tab={tab}
      onNavigate={navigateToTab}
      toast={toast}
      busy={busy}
      readOnly={Boolean(isReadOnly)}
      onRefresh={refresh}
      onSignOut={signOut}
    >
      {tab === "today" && overview && action && (
        <TodayTab overview={overview} rooms={rooms} action={action} onJump={navigateToTab} />
      )}
      {tab === "rooms" && <DeskRooms rooms={rooms} onChanged={loadOverview} setToast={setToast} readOnly={Boolean(isReadOnly)} />}
      {tab === "access" && <DeskRoomAccess onChanged={loadOverview} setToast={setToast} readOnly={Boolean(isReadOnly)} />}
      {tab === "orders" && <DeskOrders setToast={setToast} onChanged={loadOverview} readOnly={Boolean(isReadOnly)} />}
      {tab === "issues" && <DeskIssues setToast={setToast} onChanged={loadOverview} readOnly={Boolean(isReadOnly)} />}
      {tab === "tasks" && <DeskTasks setToast={setToast} onChanged={loadOverview} readOnly={Boolean(isReadOnly)} />}
      {/* ADDENDUM (staff dashboard §15.1): the ONE menu control the desk has — sold out. */}
      {tab === "menu" && <DeskMenu setToast={setToast} readOnly={Boolean(isReadOnly)} />}
      {tab === "money" && <DeskMoney setToast={setToast} onChanged={loadOverview} readOnly={Boolean(isReadOnly)} isAdmin={Boolean(isMotelManager)} />}
      {tab === "guests" && <DeskGuests setToast={setToast} onChanged={loadOverview} readOnly={Boolean(isReadOnly)} isAdmin={Boolean(isAdmin)} />}
      {tab === "reviews" && <DeskReviews setToast={setToast} onChanged={loadOverview} readOnly={Boolean(isReadOnly)} isAdmin={Boolean(isRestaurantManager)} />}
    </Shell>
  );
}

function Shell({
  user,
  today,
  tab,
  onNavigate,
  toast,
  busy,
  readOnly,
  onRefresh,
  onSignOut,
  children,
}: {
  user: SessionUser;
  today: string | null;
  tab: Tab;
  onNavigate: (tab: Tab) => void;
  toast: string;
  busy: boolean;
  readOnly: boolean;
  onRefresh: () => void;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  // Which tab the mobile drawer was opened at. Deriving "open" from it — instead of a
  // boolean plus an effect on `tab` — means changing section (by tap or by the browser's
  // back button) closes the drawer without a cascading re-render.
  const [mobileNavOpenedAtTab, setMobileNavOpenedAtTab] = useState<Tab | null>(null);
  const mobileNavOpen = mobileNavOpenedAtTab === tab;
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileNavOpenedAtTab(null);
      mobileNavTriggerRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavOpen]);

  const navigate = (nextTab: Tab) => {
    setMobileNavOpenedAtTab(null);
    onNavigate(nextTab);
  };

  return (
    <main className="desk-console-shell min-h-screen bg-[#f5f2ed] pb-8 text-[#2b241f]">
      <header className="desk-topbar sticky top-0 z-20 border-b border-[#30251d]/10 bg-white/95 backdrop-blur">
        <div className="desk-topbar-inner mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Sunrise Motel home" className="rounded-md bg-[#f28c18] px-2.5 py-2 text-[10px] font-black tracking-wider text-[#171513]">
              SUNRISE
            </Link>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9a5a20]">Sunrise Motel</p>
              <h1 className="text-sm font-bold text-[#28211c]">Front desk</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="hidden text-xs text-[#71675f] sm:block">{today ?? "—"} · Malawi time</span>
            <a className={BTN} href="/admin" aria-label="Open manager portal">Manager portal</a>
            <button className={BTN} onClick={onRefresh} disabled={busy} aria-label="Refresh front desk">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
            </button>
            <button className={BTN} onClick={onSignOut}>
              <LogOut size={14} /> Lock
            </button>
          </div>
        </div>
      </header>

      <div className="desk-workspace-layout mx-auto grid max-w-[1600px] gap-4 px-3 py-4 sm:px-4 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-6 lg:px-6 lg:py-6">
        <aside className="desk-sidebar hidden lg:block">
          <nav aria-label="Front desk sections" className="desk-green-navigation border border-[#315746] bg-[#254b3d] p-3 shadow-lg shadow-[#254b3d]/10">
            <p className="px-3 pb-3 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#d4e4d7]">Workspaces</p>
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="mb-3 last:mb-0">
                <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#a9c4b4]">{group.label}</p>
                <div className="grid gap-1">
                  {group.tabs.map((id) => {
                    const item = TABS.find((candidate) => candidate.id === id)!;
                    const Icon = item.icon;
                    const current = tab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigate(item.id)}
                        aria-current={current ? "page" : undefined}
                        className={`desk-nav-button flex min-h-10 items-center gap-3 rounded-lg px-3 text-left text-xs font-semibold transition-colors ${
                          current
                            ? "bg-[#e3eee6] text-[#244938] ring-1 ring-inset ring-[#a9c4b4]/50"
                            : "text-[#e0ebe3] hover:bg-[#315746] hover:text-white"
                        }`}
                      >
                        <Icon size={16} className={current ? "text-[#315746]" : "text-[#b9d0c0]"} />
                        <span>{item.label}</span>
                        {current && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#f28c18]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="desk-sidebar-account mt-4 border-t border-[#30251d]/10 px-3 pt-4">
              <p className="text-xs font-semibold text-white">{user.name}</p>
              <p className="mt-1 text-[10px] capitalize text-[#b9d0c0]">
                {user.role.replaceAll("_", " ")}{readOnly ? " · read only" : ""}
              </p>
              <Link href="/app" className="mt-3 inline-flex text-[11px] font-semibold text-[#e3c794] hover:text-white hover:underline">
                Open guest app →
              </Link>
            </div>
          </nav>
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="lg:hidden">
            <button
              ref={mobileNavTriggerRef}
              type="button"
              aria-expanded={mobileNavOpen}
              aria-controls="desk-mobile-sections"
              className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-[#c8d9cd] bg-[#e8f0ea] px-4 text-left shadow-sm"
              onClick={() => setMobileNavOpenedAtTab((current) => (current === tab ? null : tab))}
            >
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#5f7968]">Choose a workspace</span>
                <strong className="block truncate text-sm text-[#244938]">{TABS.find((item) => item.id === tab)?.label}</strong>
              </span>
              <ChevronDown size={18} className={`shrink-0 text-[#315746] transition-transform ${mobileNavOpen ? "rotate-180" : ""}`} />
            </button>
            {mobileNavOpen && (
              <>
              <button
                type="button"
                aria-label="Close navigation menu"
                className="desk-mobile-nav-overlay fixed inset-0 z-30 bg-[#171513]/45"
                onClick={() => setMobileNavOpenedAtTab(null)}
              />
              <nav id="desk-mobile-sections" aria-label="Front desk sections" className="desk-mobile-green-navigation fixed inset-y-0 left-0 z-40 grid max-h-dvh w-[min(20rem,86vw)] gap-3 overflow-y-auto border-r border-[#c8d9cd] bg-[#f5f8f5] p-3 shadow-2xl">
                {NAV_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#6f8877]">{group.label}</p>
                    {group.tabs.map((id) => {
                      const item = TABS.find((candidate) => candidate.id === id)!;
                      const Icon = item.icon;
                      const current = tab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-current={current ? "page" : undefined}
                          onClick={() => navigate(item.id)}
                          className={`desk-nav-button flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold ${
                            current ? "bg-[#dce9df] text-[#244938]" : "text-[#435c4b] hover:bg-[#e8f0ea]"
                          }`}
                        >
                          <Icon size={16} />
                          {item.label}
                          {current && <span className="ml-auto text-[10px] font-bold uppercase tracking-wider">Current</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-[#c8d9cd] px-2 pt-3 text-xs text-[#5f7968]">
                  <span>{user.name} · {user.role.replaceAll("_", " ")}</span>
                  <Link href="/app" className="font-semibold text-[#9a5a20]">Guest app</Link>
                </div>
              </nav>
              </>
            )}
          </div>

          <section className="desk-manager-workspace rounded-2xl border border-[#30251d]/10 bg-white px-4 py-4 shadow-sm sm:px-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#a05b1b]">
              {tab === "today" ? "Daily briefing" : `Front desk / ${TABS.find((item) => item.id === tab)?.label}`}
            </p>
            <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
              {tab === "today" && (
                <h2 className="text-xl font-bold tracking-tight text-[#29211b]">Today at a glance</h2>
              )}
              <p className="max-w-2xl text-xs leading-relaxed text-[#71675f]">{WORKSPACE_HELP[tab]}</p>
            </div>
          </section>

          {toast && (
            <p role="status" className="rounded-xl border border-[#e4b16f] bg-[#fff3df] px-4 py-3 text-sm font-medium text-[#70400e]">
              {toast}
            </p>
          )}
          {readOnly && (
            <p role="status" className="rounded-xl border border-[#c8d0db] bg-[#f2f5f9] px-4 py-3 text-sm text-[#455569]">
              <strong>Read-only access:</strong> you can review information, but changes are disabled for this account.
            </p>
          )}
          <div className="space-y-5">{children}</div>
        </div>
      </div>
    </main>
  );
}

function TodayTab({
  overview,
  rooms,
  action,
  onJump,
}: {
  overview: Overview;
  rooms: RoomSummary[];
  action: Overview["actionCentre"];
  onJump: (tab: Tab) => void;
}) {
  const kpis = overview.kpis;
  return (
    <>
      <section aria-label="Needs attention">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#29211b]">Needs attention</h2>
            <p className="mt-1 text-xs text-[#71675f]">Select an item to open the right place and follow it up.</p>
          </div>
          <span className="text-[11px] text-[#877b70]">Updated for {overview.today}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ActionCard
          label="Payments to check"
          value={`${action.paymentsToVerify.count}`}
          detail={action.paymentsToVerify.count ? `${money(action.paymentsToVerify.amount)} awaiting review` : "No payments waiting"}
          followUp={action.paymentsToVerify.oldest
            ? `Next: ${action.paymentsToVerify.oldest.payerName ?? action.paymentsToVerify.oldest.channel} · ${action.paymentsToVerify.oldest.reference ?? "no reference"} · ${money(action.paymentsToVerify.oldest.amount)}`
            : null}
          actionLabel="Review payments"
          tone={action.paymentsToVerify.count > 0 ? "warn" : "ok"}
          onClick={() => onJump("money")}
        />
        <ActionCard
          label="Guests without a room"
          value={`${action.unassignedArrivals.count}`}
          detail={action.unassignedArrivals.count ? "Assign a room before arrival" : "All arrivals have a room"}
          followUp={action.unassignedArrivals.list[0]
            ? `Next: ${action.unassignedArrivals.list[0].guestName} · ${action.unassignedArrivals.list[0].reference}`
            : null}
          actionLabel="Assign a room"
          tone={action.unassignedArrivals.count > 0 ? "warn" : "ok"}
          onClick={() => onJump("rooms")}
        />
        <ActionCard
          label="Urgent guest problems"
          value={`${action.emergencies.count}`}
          detail={action.emergencies.room ? `Needs attention · Room ${action.emergencies.room}` : "Nothing urgent"}
          followUp={action.emergencies.subject
            ? `${action.emergencies.guestName ? `${action.emergencies.guestName} · ` : ""}${action.emergencies.subject}`
            : null}
          actionLabel="Open urgent issues"
          tone={action.emergencies.count > 0 ? "bad" : "ok"}
          onClick={() => onJump("issues")}
        />
        <ActionCard
          label="Guest complaints"
          value={`${action.complaints.count}`}
          detail={action.complaints.count ? `Oldest waiting ${ageLabel(action.complaints.oldestMinutes)}` : "No complaints waiting"}
          followUp={action.complaints.oldest
            ? `Oldest: ${action.complaints.oldest.guestName ?? "Guest"}${action.complaints.oldest.room ? ` · Room ${action.complaints.oldest.room}` : ""}${action.complaints.oldest.subject ? ` · ${action.complaints.oldest.subject}` : ""}`
            : null}
          actionLabel="Open complaints"
          tone={action.complaints.count > 0 ? "warn" : "ok"}
          onClick={() => onJump("issues")}
        />
        <ActionCard
          label="Food orders to prepare"
          value={`${action.ordersWaiting.count}`}
          detail={action.ordersWaiting.count ? `Longest wait ${ageLabel(action.ordersWaiting.oldestMinutes)}` : "No orders waiting"}
          followUp={action.ordersWaiting.oldest
            ? `${action.ordersWaiting.oldest.orderNumber} · ${action.ordersWaiting.oldest.guestName ?? "Guest"}${action.ordersWaiting.oldest.roomNumber ? ` · Room ${action.ordersWaiting.oldest.roomNumber}` : ""} · ${action.ordersWaiting.oldest.status.replaceAll("_", " ")}`
            : null}
          actionLabel="Open order board"
          tone={action.ordersWaiting.count > 0 ? "warn" : "ok"}
          onClick={() => onJump("orders")}
        />
        <ActionCard
          label="Room tasks"
          value={`${action.openTasks.count}`}
          detail={action.openTasks.overdue ? `${action.openTasks.overdue} overdue · follow up` : "No overdue tasks"}
          followUp={action.openTasks.oldestOverdue
            ? `Overdue: Room ${action.openTasks.oldestOverdue.roomNumber} · ${action.openTasks.oldestOverdue.kind.replaceAll("_", " ")}${action.openTasks.oldestOverdue.assignedTo ? ` · ${action.openTasks.oldestOverdue.assignedTo}` : ""}`
            : null}
          actionLabel="Open room tasks"
          tone={action.openTasks.overdue > 0 ? "warn" : "ok"}
          onClick={() => onJump("tasks")}
        />
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Today's hotel summary">
        <Kpi label="Rooms in use" value={`${kpis.occupancy}%`} detail={`${kpis.roomsSoldToday} of ${kpis.sellableRooms} rooms`} />
        <Kpi label="Guests staying" value={`${kpis.inHouse}`} detail="Currently checked in" />
        <Kpi label="Arriving today" value={`${kpis.arrivals}`} detail={`${kpis.unassigned} need a room`} />
        <Kpi label="Leaving today" value={`${kpis.departures}`} detail="Please prepare their bills" />
        <Kpi label="Room bills unpaid" value={money(kpis.outstanding)} detail="Balance still to collect" />
      </section>
      <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <div className={CARD}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <CheckCircle2 size={15} className="text-emerald-300" /> Today&apos;s arrivals
          </h2>
          <div className="space-y-2">
            {overview.arrivals.length === 0 && <p className="text-xs text-white/50">No arrivals today.</p>}
            {overview.arrivals.map((arrival) => (
              <div key={arrival.id} className="rounded border border-white/10 bg-black/20 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{arrival.guestName}</p>
                    <p className="text-[11px] text-white/55">
                      {arrival.reference} · {arrival.roomType} · {arrival.nights} night(s) · {arrival.phone}
                    </p>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                      arrival.status === "confirmed"
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-amber-500/20 text-amber-200"
                    }`}
                  >
                    {arrival.status.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-white/60">
                  {arrival.roomNumber ? `Room ${arrival.roomNumber}` : "No room assigned yet"} ·{" "}
                  {money(arrival.amountPaid)} of {money(arrival.totalAmount)} paid
                  {arrival.requests ? ` · “${arrival.requests}”` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className={CARD}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Receipt size={15} className="text-sky-300" /> Departures &amp; in-house
          </h2>
          {overview.departures.length === 0 && <p className="text-xs text-white/50">No departures today.</p>}
          {overview.departures.map((departure) => (
            <div key={departure.id} className="mb-2 rounded border border-white/10 bg-black/20 p-2">
              <p className="text-sm font-semibold">
                {departure.guestName}
                {departure.roomNumber ? ` · Room ${departure.roomNumber}` : ""}
              </p>
              <p className="text-[11px] text-white/55">
                {departure.reference} · balance {money(departure.totalAmount - departure.amountPaid)} ·{" "}
                <button className="underline" onClick={() => onJump("rooms")}>
                  check out from the room map
                </button>
              </p>
            </div>
          ))}
          <div className="mt-3 border-t border-white/10 pt-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-white/50">In-house now</p>
            {overview.inHouse.length === 0 && <p className="text-xs text-white/50">Nobody is checked in.</p>}
            {overview.inHouse.map((guest) => (
              <div key={guest.id} className="flex items-center justify-between border-b border-white/5 py-1.5 text-xs">
                <span>
                  {guest.roomNumber ? <strong>Room {guest.roomNumber}</strong> : "No room"} · {guest.guestName}
                </span>
                <span className="text-white/60">
                  {guest.checkIn} → {guest.checkOut} · bal {money(guest.balance)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className={CARD}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <BedDouble size={15} className="text-[#f8c66b]" /> Rooms &amp; guests in-house
          </h2>
          <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
            {Object.entries(overview.roomStates).map(([state, count]) => (
              <span key={state} className="rounded border border-white/15 bg-white/5 px-2 py-1">
                {state.replace("_", " ")}: <strong>{count}</strong>
              </span>
            ))}
          </div>
          {overview.outOfOrderRooms.length > 0 && (
            <div className="mb-3 rounded border border-rose-500/40 bg-rose-500/10 p-2 text-[11px] text-rose-100">
              Out of order:{" "}
              {overview.outOfOrderRooms
                .map(
                  (room) =>
                    `${room.roomNumber} (${room.reason ?? "maintenance"}${room.until ? ` until ${room.until}` : ""})`,
                )
                .join(", ")}
            </div>
          )}
          <div className="max-h-[min(55vh,32rem)] space-y-2 overflow-y-auto pr-1">
            {rooms.map((room) => (
              <div key={room.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">
                      Room {room.roomNumber}
                      <span className="font-normal text-white/55"> · {room.roomType}</span>
                    </p>
                    <p className="mt-0.5 text-[10px] capitalize text-white/45">
                      {room.floor ? `${room.floor} · ` : ""}{room.state.replaceAll("_", " ")}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    room.occupant ? "bg-amber-500/15 text-amber-100" : "bg-emerald-500/15 text-emerald-100"
                  }`}>
                    {room.occupant ? "Occupied" : "No active guest"}
                  </span>
                </div>
                {room.occupant && (
                  <div className="mt-2 border-t border-white/10 pt-2 text-[11px] text-white/65">
                    <p className="font-medium text-white">{room.occupant.guestName}</p>
                    <p>{room.occupant.reference} · {room.occupant.checkIn} → {room.occupant.checkOut}</p>
                    <p className="mt-0.5 capitalize text-white/45">
                      Stay {room.occupant.status.replaceAll("_", " ")}
                      {room.occupant.appAccount ? ` · app ${room.occupant.appAccount}` : ""}
                    </p>
                  </div>
                )}
              </div>
            ))}
            {rooms.length === 0 && <p className="text-xs text-white/50">No room details available.</p>}
          </div>
        </div>
      </section>
    </>
  );
}

function ActionCard({
  label,
  value,
  detail,
  followUp,
  actionLabel,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  followUp: string | null;
  actionLabel: string;
  tone: "ok" | "warn" | "bad";
  onClick: () => void;
}) {
  const tones = {
    ok: "border-white/10 bg-white/[0.03]",
    warn: "border-amber-500/40 bg-amber-500/10",
    bad: "border-rose-500/50 bg-rose-500/15",
  } as const;
  const content = (
    <>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#71675f]">
        {tone === "bad" && <AlertTriangle size={12} className="text-rose-300" />}
        {label}
      </p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-2xl font-black leading-none text-[#29211b]">{value}</p>
        <span className="text-xs font-semibold text-[#9a5a20] group-hover:underline">
          {Number(value) > 0 ? `${actionLabel} →` : "All clear"}
        </span>
      </div>
      <p className="mt-2 text-xs text-[#71675f]">{detail}</p>
      {followUp && (
        <p className="mt-2 border-t border-[#30251d]/10 pt-2 text-[11px] font-medium leading-relaxed text-[#4d443d]">
          {followUp}
        </p>
      )}
    </>
  );
  const className = `desk-attention-card desk-attention-card--${tone} group min-h-[116px] rounded-xl border p-4 text-left shadow-sm ${tones[tone]}`;
  return Number(value) > 0 ? (
    <button type="button" onClick={onClick} className={`${className} transition hover:-translate-y-0.5 hover:shadow-md`}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-[#30251d]/10 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#877b70]">{label}</p>
      <p className="mt-2 text-lg font-bold text-[#29211b]">{value}</p>
      <p className="mt-1 text-[11px] text-[#71675f]">{detail}</p>
    </div>
  );
}
