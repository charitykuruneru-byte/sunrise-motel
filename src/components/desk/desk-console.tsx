"use client";

import {
  AlertTriangle,
  BedDouble,
  BellRing,
  CheckCircle2,
  ChefHat,
  ClipboardList,
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
import { useCallback, useEffect, useState } from "react";
import DeskGuests from "./desk-guests";
import DeskIssues from "./desk-issues";
import DeskMenu from "./desk-menu";
import DeskMoney from "./desk-money";
import DeskOrders from "./desk-orders";
import DeskReviews from "./desk-reviews";
import DeskRoomAccess from "./desk-roomaccess";
import DeskRooms from "./desk-rooms";
import DeskTasks from "./desk-tasks";
import { api, BTN, BTN_PRIMARY, CARD, INPUT, money } from "./shared";

type Tab = "today" | "rooms" | "access" | "orders" | "issues" | "tasks" | "menu" | "money" | "guests" | "reviews";

export type RoomSummary = { id: string; roomNumber: string; roomType: string; state: string };

type Overview = {
  today: string;
  actionCentre: {
    paymentsToVerify: { count: number; amount: number };
    unassignedArrivals: {
      count: number;
      list: { id: string; reference: string; guestName: string; roomType: string; checkIn: string }[];
    };
    emergencies: { count: number; room: string | null; subject: string | null };
    complaints: { count: number; oldestMinutes: number };
    escalatedBookings: { count: number };
    ordersWaiting: { count: number; oldestMinutes: number };
    openTasks: { count: number; overdue: number };
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
  recentActivity: {
    id: string; action: string; summary: string | null; actor: string;
    actorLabel: string | null; createdAt: string;
  }[];
};

type SessionUser = { id: string; staffCode: string; name: string; email: string; role: string };

const TABS: { id: Tab; label: string; icon: typeof BedDouble }[] = [
  { id: "today", label: "Today", icon: BellRing },
  { id: "rooms", label: "Room map", icon: BedDouble },
  { id: "access", label: "Room access", icon: QrCode },
  { id: "orders", label: "Orders", icon: UtensilsCrossed },
  { id: "issues", label: "Messages & issues", icon: MessageSquare },
  { id: "tasks", label: "Housekeeping", icon: Wrench },
  { id: "menu", label: "Menu · sold out", icon: ChefHat },
  { id: "money", label: "Payments & folios", icon: CreditCard },
  { id: "guests", label: "Guests", icon: Users },
  { id: "reviews", label: "Reviews & waitlist", icon: Star },
];

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

  const isReadOnly = user?.role === "auditor";
  // ADDENDUM (authority matrix §5/§6): the admin-only controls are not greyed out for a staff
  // session — they are ABSENT, so a staff member never has to wonder whether they are allowed.
  // The server enforces the same line (403), so hiding them here is convenience, not security.
  const isAdmin = user?.role === "admin";

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
      <main className="flex min-h-screen items-center justify-center bg-[#12100e] p-6 text-white">
        <form onSubmit={signIn} className="w-full max-w-md space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-center gap-3">
            <div className="rounded bg-[#f28c18] p-2 text-[#171513]">
              <Key size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold">Sunrise front desk</h1>
              <p className="text-xs text-white/60">
                Sign in with a staff account — the manager password still works.
              </p>
            </div>
          </div>
          <input
            className={INPUT}
            placeholder="staff@sunrisemotel.mw (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={INPUT}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {loginError && (
            <p className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">{loginError}</p>
          )}
          <button className={BTN_PRIMARY} disabled={busy} type="submit">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />} Sign in
          </button>
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
      setTab={setTab}
      toast={toast}
      busy={busy}
      readOnly={Boolean(isReadOnly)}
      onRefresh={refresh}
      onSignOut={signOut}
    >
      {tab === "today" && overview && action && <TodayTab overview={overview} action={action} onJump={setTab} />}
      {tab === "rooms" && <DeskRooms rooms={rooms} onChanged={loadOverview} setToast={setToast} readOnly={Boolean(isReadOnly)} />}
      {tab === "access" && <DeskRoomAccess onChanged={loadOverview} setToast={setToast} readOnly={Boolean(isReadOnly)} />}
      {tab === "orders" && <DeskOrders setToast={setToast} onChanged={loadOverview} readOnly={Boolean(isReadOnly)} />}
      {tab === "issues" && <DeskIssues setToast={setToast} onChanged={loadOverview} readOnly={Boolean(isReadOnly)} />}
      {tab === "tasks" && <DeskTasks setToast={setToast} onChanged={loadOverview} readOnly={Boolean(isReadOnly)} />}
      {/* ADDENDUM (staff dashboard §15.1): the ONE menu control the desk has — sold out. */}
      {tab === "menu" && <DeskMenu setToast={setToast} readOnly={Boolean(isReadOnly)} />}
      {tab === "money" && <DeskMoney setToast={setToast} onChanged={loadOverview} readOnly={Boolean(isReadOnly)} isAdmin={Boolean(isAdmin)} />}
      {tab === "guests" && <DeskGuests setToast={setToast} onChanged={loadOverview} readOnly={Boolean(isReadOnly)} isAdmin={Boolean(isAdmin)} />}
      {tab === "reviews" && <DeskReviews setToast={setToast} onChanged={loadOverview} readOnly={Boolean(isReadOnly)} isAdmin={Boolean(isAdmin)} />}
    </Shell>
  );
}

function Shell({
  user,
  today,
  tab,
  setTab,
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
  setTab: (tab: Tab) => void;
  toast: string;
  busy: boolean;
  readOnly: boolean;
  onRefresh: () => void;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#12100e] pb-16 text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#171513]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded bg-[#f28c18] px-2 py-1 text-[10px] font-black tracking-wider text-[#171513]">
              SUNRISE
            </span>
            <div>
              <h1 className="text-sm font-bold">Front desk &amp; admin console</h1>
              <p className="text-[11px] text-white/55">
                {today ?? "—"} · Malawi time · {user.name} ({user.role}){readOnly ? " · read-only" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a className={BTN} href="/admin">
              Legacy portal
            </a>
            <a className={BTN} href="/app">
              Guest app
            </a>
            <button className={BTN} onClick={onRefresh} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
            </button>
            <button className={BTN} onClick={onSignOut}>
              <LogOut size={14} /> Lock
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-4 pb-2">
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-t border-b-2 px-3 py-2 text-xs font-semibold ${
                  tab === item.id
                    ? "border-[#f28c18] text-[#f8c66b]"
                    : "border-transparent text-white/55 hover:text-white/80"
                }`}
              >
                <Icon size={14} /> {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      {toast && (
        <div className="mx-auto mt-3 max-w-[1400px] px-4">
          <p className="rounded border border-[#f28c18]/40 bg-[#f28c18]/10 px-3 py-2 text-xs text-[#f8c66b]">
            {toast}
          </p>
        </div>
      )}
      {readOnly && (
        <div className="mx-auto mt-3 max-w-[1400px] px-4">
          <p className="rounded border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/70">
            Auditor session: read everything, change nothing.
          </p>
        </div>
      )}
      <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-4">{children}</div>
    </main>
  );
}

function TodayTab({
  overview,
  action,
  onJump,
}: {
  overview: Overview;
  action: Overview["actionCentre"];
  onJump: (tab: Tab) => void;
}) {
  const kpis = overview.kpis;
  return (
    <>
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <ActionCard
          label="Payments to verify"
          value={`${action.paymentsToVerify.count}`}
          detail={money(action.paymentsToVerify.amount)}
          tone={action.paymentsToVerify.count > 0 ? "warn" : "ok"}
          onClick={() => onJump("money")}
        />
        <ActionCard
          label="Unassigned arrivals"
          value={`${action.unassignedArrivals.count}`}
          detail="assign before 15:00"
          tone={action.unassignedArrivals.count > 0 ? "warn" : "ok"}
          onClick={() => onJump("rooms")}
        />
        <ActionCard
          label="Emergency issues"
          value={`${action.emergencies.count}`}
          detail={action.emergencies.room ? `Room ${action.emergencies.room}` : "nothing urgent"}
          tone={action.emergencies.count > 0 ? "bad" : "ok"}
          onClick={() => onJump("issues")}
        />
        <ActionCard
          label="Open complaints"
          value={`${action.complaints.count}`}
          detail={`oldest ${action.complaints.oldestMinutes} min`}
          tone={action.complaints.count > 0 ? "warn" : "ok"}
          onClick={() => onJump("issues")}
        />
        <ActionCard
          label="Orders waiting"
          value={`${action.ordersWaiting.count}`}
          detail={action.ordersWaiting.count ? `oldest ${action.ordersWaiting.oldestMinutes} min` : "board clear"}
          tone={action.ordersWaiting.count > 0 ? "warn" : "ok"}
          onClick={() => onJump("orders")}
        />
        <ActionCard
          label="Open tasks"
          value={`${action.openTasks.count}`}
          detail={`${action.openTasks.overdue} overdue`}
          tone={action.openTasks.overdue > 0 ? "warn" : "ok"}
          onClick={() => onJump("tasks")}
        />
      </section>

      <section className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Occupancy" value={`${kpis.occupancy}%`} detail={`${kpis.roomsSoldToday}/${kpis.sellableRooms} rooms`} />
        <Kpi label="ADR" value={money(kpis.adr)} detail="average daily rate" />
        <Kpi label="RevPAR" value={money(kpis.revpar)} detail="per available room" />
        <Kpi label="In-house" value={`${kpis.inHouse}`} detail="staying right now" />
        <Kpi label="Arrivals" value={`${kpis.arrivals}`} detail={`${kpis.unassigned} unassigned`} />
        <Kpi label="Departures" value={`${kpis.departures}`} detail="due out today" />
        <Kpi label="Outstanding" value={money(kpis.outstanding)} detail="open room bills" />
        <Kpi label="Unverified" value={money(kpis.unverifiedPayments)} detail="at risk" />
      </section>
      <section className="grid gap-3 lg:grid-cols-3">
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
            <ClipboardList size={15} className="text-[#f8c66b]" /> Room states &amp; activity
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
          <div className="space-y-1.5">
            {overview.recentActivity.map((entry) => (
              <p key={entry.id} className="text-[11px] text-white/60">
                <span className="text-white/40">
                  {new Date(entry.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </span>{" "}
                {entry.summary ?? entry.action}
              </p>
            ))}
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
  tone,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "ok" | "warn" | "bad";
  onClick: () => void;
}) {
  const tones = {
    ok: "border-white/10 bg-white/[0.03]",
    warn: "border-amber-500/40 bg-amber-500/10",
    bad: "border-rose-500/50 bg-rose-500/15",
  } as const;
  return (
    <button onClick={onClick} className={`rounded-lg border p-3 text-left ${tones[tone]}`}>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-white/60">
        {tone === "bad" && <AlertTriangle size={12} className="text-rose-300" />}
        {label}
      </p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      <p className="text-[11px] text-white/60">{detail}</p>
    </button>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-white/50">{label}</p>
      <p className="mt-1 text-base font-bold text-[#f8c66b]">{value}</p>
      <p className="text-[10px] text-white/45">{detail}</p>
    </div>
  );
}




