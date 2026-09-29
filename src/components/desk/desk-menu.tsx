"use client";

import { CheckCircle2, ChefHat, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, BTN, BTN_DANGER, BTN_PRIMARY, CARD, money } from "./shared";

type MenuRow = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  imageUrl: string;
  isAvailable: boolean;
  isSpecial: boolean;
};

/**
 * THE ONE MENU EXCEPTION (staff dashboard, Part 15.1).
 *
 * The kitchen runs out of chambo at 19:40. Waiting for a manager to take it off the menu is how a
 * guest orders food that does not exist. This screen gives the desk exactly one control per dish —
 * **sold out** — and nothing else: no price, no description, no photo, no add, no delete.
 *
 * Closing it immediately changes `/dine` and in-app ordering, because both read `menu_items`.
 */
export default function DeskMenu({
  setToast,
  readOnly,
}: {
  setToast: (message: string) => void;
  readOnly: boolean;
}) {
  const [items, setItems] = useState<MenuRow[]>([]);
  const [soldOut, setSoldOut] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api<{ items: MenuRow[]; summary: { soldOut: number } }>("/api/desk/menu");
      setItems(data.items);
      setSoldOut(data.summary.soldOut);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not load the menu.");
    } finally {
      setLoading(false);
    }
  }, [setToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (item: MenuRow) => {
    if (readOnly) return;
    setBusyId(item.id);
    try {
      const next = !item.isAvailable;
      await api("/api/desk/menu", {
        method: "POST",
        body: JSON.stringify({ menuItemId: item.id, isAvailable: next }),
      });
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, isAvailable: next } : row)));
      setSoldOut((count) => Math.max(0, count + (next ? -1 : 1)));
      setToast(
        next
          ? `"${item.name}" is back on sale — guests can order it again.`
          : `"${item.name}" is sold out — it has stopped appearing in ordering.`,
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : "That change failed.");
    } finally {
      setBusyId(null);
    }
  };

  const categories = [...new Set(items.map((item) => item.category))];

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <ChefHat size={16} className="text-[#f8c66b]" /> Menu — sold out
        </h2>
        <div className="flex items-center gap-2">
          <span className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/70">
            {items.length} dishes · <strong>{soldOut}</strong> sold out
          </span>
          <button className={BTN} onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
          </button>
        </div>
      </section>

      <p className="rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/60">
        The kitchen runs out mid-service, so the desk can stop a dish being ordered here. This is the
        only menu control the desk has: no prices, no description, no photographs, no adding or
        deleting. A sold-out dish disappears from ordering straight away and stays on the menu for
        tomorrow.
      </p>

      {categories.map((category) => (
        <section key={category} className={CARD}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/60">{category}</h3>
          <div className="space-y-1.5">
            {items
              .filter((item) => item.category === category)
              .map((item) => (
                <div
                  key={item.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded border p-2.5 text-xs ${
                    item.isAvailable ? "border-white/10 bg-black/20" : "border-rose-500/40 bg-rose-500/10"
                  }`}
                >
                  <div>
                    <p className="font-bold">
                      {item.name}
                      {item.isSpecial && (
                        <span className="ml-2 rounded bg-[#f28c18]/20 px-1.5 py-0.5 text-[10px] text-[#f8c66b]">
                          special
                        </span>
                      )}
                      {!item.isAvailable && (
                        <span className="ml-2 rounded bg-rose-500/25 px-1.5 py-0.5 text-[10px] text-rose-100">
                          SOLD OUT
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-white/55">{money(item.price)}</p>
                  </div>
                  {!readOnly && (
                    <button
                      className={item.isAvailable ? BTN_DANGER : BTN_PRIMARY}
                      disabled={busyId === item.id}
                      onClick={() => void toggle(item)}
                    >
                      {busyId === item.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={13} />
                      )}
                      {item.isAvailable ? "Sold out" : "Back on sale"}
                    </button>
                  )}
                </div>
              ))}
          </div>
        </section>
      ))}

      {!loading && items.length === 0 && (
        <p className="text-[11px] text-white/40">
          No dishes are in the menu table yet — seed or add them from the admin portal.
        </p>
      )}
    </div>
  );
}