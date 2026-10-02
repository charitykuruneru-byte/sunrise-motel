"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Loader2, Minus, Plus, Search, Send, Utensils } from "lucide-react";
import type { FormEvent } from "react";

type LiveItem = {
  id: string;
  name: string;
  price: number;
  category: string;
  mealPeriod: string | null;
  menuCategory: string;
  image_url: string;
  is_available: boolean;
  description: string;
  prep_time_mins: number;
  is_special: boolean;
};

const MEALS = ["all", "breakfast", "lunch", "dinner"] as const;
const money = (price: number) => `MWK ${Math.round(price).toLocaleString("en-US")}`;

export default function LiveMenu() {
  const [items, setItems] = useState<LiveItem[]>([]);
  const [meal, setMeal] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [menuError, setMenuError] = useState("");
  const [orderError, setOrderError] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState("");
  const [isNudgeOrder, setIsNudgeOrder] = useState(false);
  const [nudgeType, setNudgeType] = useState("");
  const [preorder, setPreorder] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMeal = params.get("meal");
    if (requestedMeal === "late_night_preorder") setMeal("dinner");
    else if (requestedMeal && MEALS.some((value) => value === requestedMeal)) setMeal(requestedMeal);
    setIsNudgeOrder(params.get("source") === "auto_nudge");
    setPreorder(params.has("preorder"));
    setNudgeType(params.has("preorder") ? "late_night_preorder" : requestedMeal || "");
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const response = await fetch("/api/menu/live", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The menu could not be loaded.");
      if (active) {
        setMenuError("");
        setItems(data.items ?? []);
        setUpdatedAt(new Date());
      }
    };
    const safeLoad = () => { void load().catch((cause) => { if (active) setMenuError(cause instanceof Error ? cause.message : "The menu could not be loaded."); }); };
    safeLoad();
    const timer = window.setInterval(safeLoad, 30_000);
    const onFocus = () => { if (document.visibilityState === "visible") safeLoad(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) =>
      (meal === "all" || item.mealPeriod === null || item.mealPeriod === meal) &&
      (!query || `${item.name} ${item.description} ${item.menuCategory}`.toLowerCase().includes(query)),
    );
  }, [items, search, meal]);
  const categoryGroups = useMemo(() => {
    const groups = new Map<string, LiveItem[]>();
    for (const item of visibleItems) {
      groups.set(item.menuCategory, [...(groups.get(item.menuCategory) ?? []), item]);
    }
    return Array.from(groups.entries());
  }, [visibleItems]);
  const lines = items.filter((item) => (cart[item.id] ?? 0) > 0);
  const count = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  const total = lines.reduce((sum, item) => sum + item.price * cart[item.id], 0);

  const updateQty = (id: string, amount: number) => {
    setCart((current) => ({ ...current, [id]: Math.max(0, Math.min(20, (current[id] ?? 0) + amount)) }));
    setSuccess("");
  };

  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setOrderError("");
    try {
      const response = await fetch("/api/menu/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName: name,
          guestPhone: phone,
          note,
          items: lines.map((item) => ({ menuItemId: item.id, qty: cart[item.id] })),
          isAutoNudge: isNudgeOrder,
          nudgeType: isNudgeOrder ? (preorder ? "late_night_preorder" : nudgeType) : undefined,
          scheduledFor: isNudgeOrder ? new Date().toISOString() : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.order) throw new Error(data.error || "Could not send your order.");
      setSuccess(`${data.message} Order ${data.order.orderNumber}.`);
      setCart({});
      window.dispatchEvent(new CustomEvent("meal-alert-attended", { detail: { mealType: nudgeType } }));
    } catch (cause) {
      setOrderError(cause instanceof Error ? cause.message : "Could not send your order.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-white px-4 py-10 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div><span className="text-xs font-bold tracking-[0.18em] text-emerald-700">SUNRISE MOTEL · LIVE MENU</span><h1 className="mt-2 text-3xl font-bold">Fresh from the kitchen</h1><p className="mt-2 text-slate-600">Menu availability and prices are updated from the restaurant.</p></div>
          {updatedAt && <span className="text-xs text-slate-500">Updated {Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 60_000))} min ago</span>}
        </header>
        {isNudgeOrder && <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{preorder ? "Late-arrival pre-order: the front desk will confirm your request." : "Your meal alert menu is ready. Add items and send your order to the kitchen."}</div>}
        {menuError && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{menuError}</p>}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {MEALS.map((value) => <button key={value} type="button" onClick={() => setMeal(value)} className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize ${meal === value ? "bg-[#0f172a] text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{value === "all" ? "All menu" : value}</button>)}
          <label className="ml-auto flex min-w-48 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 sm:max-w-xs"><Search size={16} className="text-slate-400" /><input aria-label="Search menu" className="w-full bg-transparent text-sm outline-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search dishes…" /></label>
        </div>
        {updatedAt === null && !menuError ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin" />Loading live menu…</div> : menuError ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">Live menu data is unavailable right now.</div> : visibleItems.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500"><Utensils className="mx-auto mb-2" />No dishes found for this filter.</div> : (
          <div className="space-y-7">
            {categoryGroups.map(([category, categoryItems]) => (
              <section key={category} aria-label={`${category} menu category`}>
                <h2 className="mb-3 text-lg font-bold text-slate-800">{category}</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {categoryItems.map((item) => (
                    <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
                      <div className="relative h-48 bg-slate-100">
                        {item.image_url ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center text-sm text-rose-600">No image</div>}
                        {!item.is_available && <span className="absolute right-3 top-3 rounded-full bg-rose-700 px-3 py-1 text-xs font-bold text-white">Unavailable</span>}
                        {item.is_special && <span className="absolute left-3 top-3 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-slate-900">Today&apos;s special</span>}
                      </div>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3"><div><span className="text-xs font-bold uppercase tracking-wide text-slate-500">{item.menuCategory}</span><h3 className="mt-1 font-bold">{item.name}</h3></div><strong className="whitespace-nowrap">{money(item.price)}</strong></div>
                        <p className="mt-2 min-h-10 text-sm text-slate-600">{item.description}</p>
                        <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span className="flex items-center gap-1"><Clock3 size={13} /> {item.prep_time_mins} min</span>{item.is_available ? <span className="font-semibold text-emerald-700">Available</span> : <span>Check back later</span>}</div>
                        <div className="mt-4 flex items-center justify-end gap-3">
                          <button disabled={!item.is_available || !(cart[item.id] > 0)} type="button" onClick={() => updateQty(item.id, -1)} aria-label={`Remove ${item.name}`} className="rounded-lg border p-2 disabled:opacity-30"><Minus size={15} /></button>
                          <span className="min-w-5 text-center text-sm font-bold">{cart[item.id] ?? 0}</span>
                          <button disabled={!item.is_available || cart[item.id] >= 20} type="button" onClick={() => updateQty(item.id, 1)} aria-label={`Add ${item.name}`} className="rounded-lg border p-2 disabled:opacity-30"><Plus size={15} /></button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        <section className="mt-8 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Your order</h2><p className="text-sm text-slate-600">{count} items · kitchen payment is collected at pickup or service.</p></div><strong className="text-lg">{money(total)}</strong></div>
          {success ? <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-800"><CheckCircle2 />{success}</div> : (
            <form onSubmit={submitOrder} className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">Your name<input required minLength={2} maxLength={160} className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal" value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label className="text-sm font-semibold">WhatsApp / phone<input required type="tel" maxLength={40} className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
              <label className="text-sm font-semibold sm:col-span-2">Order note (optional)<textarea maxLength={500} rows={2} className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Pickup time or dietary note" /></label>
              {orderError && <p role="alert" className="sm:col-span-2 text-sm text-rose-700">{orderError}</p>}
              <div className="flex items-center justify-between gap-3 sm:col-span-2"><span className="text-xs text-slate-500">You will pay at the counter. Room-charge orders remain available in the signed-in room app.</span><button disabled={!count || sending} className="inline-flex items-center gap-2 rounded-xl bg-[#0f172a] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}Send order</button></div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
