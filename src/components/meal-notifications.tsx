"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Clock3, X } from "lucide-react";
import { usePathname } from "next/navigation";

type MealSetting = {
  id: string;
  mealType: string;
  title: string;
  message: string;
  ctaText: string;
  imageUrl: string | null;
  popupDurationMinutes: number;
  expiresAt: string | null;
  popupAvailable: boolean;
  status: "active" | "ended" | "upcoming";
};
type NotificationContextValue = {
  today: MealSetting[];
  current: MealSetting | null;
  open: (setting: MealSetting) => void;
  dismiss: (setting: MealSetting) => void;
  snooze: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);
const icon: Record<string, string> = {
  breakfast: "🍳",
  lunch: "🍲",
  dinner: "🍛",
  late_night_preorder: "🌙",
  custom: "✨",
};

function localKey(kind: "dismissed" | "attended", mealType: string, date: string) {
  return `${kind}_${mealType}_${date}`;
}

export function MealNotificationsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [today, setToday] = useState<MealSetting[]>([]);
  const [date, setDate] = useState("");
  const [current, setCurrent] = useState<MealSetting | null>(null);
  const [snoozedUntil, setSnoozedUntil] = useState(0);

  const load = useCallback(async () => {
    const response = await fetch("/api/notifications/active", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not check meal alerts.");
    setDate(data.date ?? "");
    setToday(data.today ?? []);
  }, []);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        if (mounted) await load();
      } catch (error) {
        console.error("Meal notifications refresh failed", error);
      }
    };
    void refresh();
    const poll = window.setInterval(() => void refresh(), 60_000);
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      mounted = false;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    const onAttended = (event: Event) => {
      const mealType = (event as CustomEvent<{ mealType?: string }>).detail?.mealType;
      if (mealType && date) localStorage.setItem(localKey("attended", mealType, date), "1");
      setCurrent(null);
      setSnoozedUntil(Date.now() + 5 * 60_000);
    };
    window.addEventListener("meal-alert-attended", onAttended);
    return () => window.removeEventListener("meal-alert-attended", onAttended);
  }, [date]);

  // Derived, not state: whether this page is a guest surface where the meal-alert
  // popup may appear. Computing it during render (instead of calling setVisible in
  // an effect) means toggling it can never cascade a re-render.
  const isGuestSurface = !pathname.startsWith("/admin") && !pathname.startsWith("/desk") && !pathname.startsWith("/api");
  const preorderQuery =
    typeof window !== "undefined"
      ? (() => { const q = new URLSearchParams(window.location.search); return q.has("preorder") || q.get("source") === "auto_nudge"; })()
      : false;
  const isPreorderPage = pathname === "/menu" && preorderQuery;
  const visible = isGuestSurface && !isPreorderPage;

  useEffect(() => {
    if (!visible || !date || typeof document === "undefined" || document.visibilityState !== "visible") return;
    if (current || Date.now() < snoozedUntil) return;
    const next = today.find((item) =>
      item.status === "active" &&
      item.popupAvailable &&
      !localStorage.getItem(localKey("dismissed", item.mealType, date)) &&
      !localStorage.getItem(localKey("attended", item.mealType, date)),
    );
    if (next) window.setTimeout(() => setCurrent(next), 0);
  }, [pathname, today, date, current, snoozedUntil, visible]);

  const dismiss = useCallback((setting: MealSetting) => {
    if (date) localStorage.setItem(localKey("dismissed", setting.mealType, date), "1");
    setCurrent(null);
    setSnoozedUntil(Date.now() + 5 * 60_000);
    void fetch("/api/notifications/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mealType: setting.mealType, date }),
    }).then(async (response) => {
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error("Meal alert dismissal could not be logged", data.error || response.statusText);
      }
    }).catch((error) => console.error("Meal alert dismissal could not be logged", error));
  }, [date]);

  const snooze = useCallback(() => {
    setCurrent(null);
    setSnoozedUntil(Date.now() + 5 * 60_000);
  }, []);

  const value = useMemo<NotificationContextValue>(() => ({
    today,
    current: visible ? current : null,
    open: (setting) => { setCurrent(setting); setSnoozedUntil(0); },
    dismiss,
    snooze,
  }), [today, current, visible, dismiss, snooze]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <MealAlertPopup />
    </NotificationContext.Provider>
  );
}

function useMealNotifications() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error("Meal notification controls must be inside MealNotificationsProvider.");
  return value;
}

function MealAlertPopup() {
  const { current, dismiss, snooze } = useMealNotifications();
  const [remaining, setRemaining] = useState(0);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const [preview, setPreview] = useState<{ name: string; image_url: string; price: number }[]>([]);
  const previewMeal = current?.mealType === "late_night_preorder" ? "dinner" : current?.mealType;
  const close = useCallback((action: "dismiss" | "snooze") => {
    if (!current || closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(() => {
      if (action === "dismiss") dismiss(current);
      else snooze();
      setPreview([]);
      closingRef.current = false;
      setClosing(false);
    }, 180);
  }, [current, dismiss, snooze]);
  useEffect(() => {
    if (!current || !previewMeal || !["breakfast", "lunch", "dinner"].includes(previewMeal)) {
      return;
    }
    let active = true;
    void fetch(`/api/menu/live?meal=${encodeURIComponent(previewMeal)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load menu preview.");
        const items: unknown[] = Array.isArray(data.items) ? data.items : [];
        const menuItems = items.filter((item): item is { name: string; image_url: string; price: number; is_available: boolean } =>
          typeof item === "object" && item !== null &&
          "name" in item && typeof item.name === "string" &&
          "image_url" in item && typeof item.image_url === "string" &&
          "price" in item && typeof item.price === "number" &&
          "is_available" in item && typeof item.is_available === "boolean");
        if (active) setPreview(menuItems.filter((item) => item.is_available).slice(0, 3));
      })
      .catch((error) => console.error("Meal alert menu preview failed", error));
    return () => { active = false; };
  }, [current, previewMeal]);
  useEffect(() => {
    if (!current) return;
    const update = () => {
      const end = current.expiresAt ? new Date(current.expiresAt).getTime() : Date.now() + current.popupDurationMinutes * 60_000;
      const value = Math.max(0, Math.ceil((end - Date.now()) / 60_000));
      setRemaining(value);
      if (value === 0) close("snooze");
    };
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [current, close]);
  if (!current) return null;
  const meal = current.mealType === "late_night_preorder" ? "dinner" : current.mealType;
  const href = `/menu?meal=${encodeURIComponent(meal)}&source=auto_nudge${current.mealType === "late_night_preorder" ? "&preorder=1" : ""}`;
  return (
    <aside className={`meal-alert-popup fixed bottom-16 left-0 right-0 z-[80] w-full overflow-hidden rounded-t-2xl border border-slate-200/70 bg-white/95 shadow-2xl backdrop-blur-xl sm:bottom-5 sm:left-auto sm:right-4 sm:w-[min(380px,calc(100vw-2rem))] sm:rounded-b-2xl ${closing ? "is-closing" : ""}`} role="dialog" aria-live="polite" aria-label={current.title}>
      {current.imageUrl && <img src={current.imageUrl} alt="" className="h-32 w-full object-cover" />}
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-xs font-bold tracking-wide text-emerald-700"><span className="animate-pulse">●</span> LIVE FROM KITCHEN</span>
          <button type="button" onClick={() => close("dismiss")} aria-label="Dismiss alert" className="rounded-full p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex gap-3">
          <span className="text-3xl" aria-hidden="true">{icon[current.mealType] ?? icon.custom}</span>
          <div><h2 className="text-lg font-bold text-slate-900">{current.title}</h2><p className="mt-1 text-sm text-slate-600">{current.message}</p></div>
        </div>
        {preview.length > 0 && <div className="mt-3 flex gap-2">{preview.map((item) => <div key={item.name} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-slate-100 p-2">{item.image_url && <img src={item.image_url} alt="" className="h-9 w-9 rounded-md object-cover" />}<span className="min-w-0"><strong className="block truncate text-[11px]">{item.name}</strong><small className="text-[10px] text-slate-600">MWK {item.price.toLocaleString()}</small></span></div>)}</div>}
        <div className="mt-4 flex items-center justify-between gap-3">
          <Link href={href} onClick={snooze} className="rounded-xl bg-[#0f172a] px-4 py-2.5 text-sm font-semibold text-white">{current.ctaText || "View Menu & Order"}</Link>
          <span className="flex items-center gap-1 text-xs text-slate-500"><Clock3 size={13} /> {remaining} min left</span>
        </div>
      </div>
    </aside>
  );
}

export function MealAlertBell({ placement = "header" }: { placement?: "header" | "floating" }) {
  const { today, open } = useMealNotifications();
  const [expanded, setExpanded] = useState(false);
  const active = today.filter((setting) => setting.status === "active");
  const visibleAlerts = today.filter((setting) => setting.status !== "upcoming");
  return (
    <div className={placement === "floating" ? "fixed bottom-5 right-5 z-[79]" : "relative z-[79]"}>
      {expanded && (
        <section className={`${placement === "floating" ? "bottom-16 right-0" : "right-0 top-full mt-2"} absolute w-[min(350px,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl`} aria-label="Meal notification center">
          <div className="mb-3 flex items-center justify-between"><strong className="text-slate-900">Today&apos;s meal alerts</strong><button onClick={() => setExpanded(false)} aria-label="Close alerts"><X size={17} /></button></div>
          {visibleAlerts.length === 0 ? <p className="text-sm text-slate-500">No meal alerts are active yet.</p> : visibleAlerts.map((setting) => (
            <button key={setting.id} type="button" onClick={() => { open(setting); setExpanded(false); }} className="flex w-full items-center gap-3 border-t border-slate-100 py-3 text-left">
              <span className="text-xl">{icon[setting.mealType] ?? icon.custom}</span>
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{setting.title}</strong><small className="text-slate-500">{setting.status === "active" ? "Available now" : "Finished for today"}</small></span>
            </button>
          ))}
        </section>
      )}
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={`Meal alerts${active.length ? `, ${active.length} active` : ""}`} className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#0f172a] text-white shadow-xl">
        <Bell size={19} />
        {active.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold">{active.length}</span>}
      </button>
    </div>
  );
}
