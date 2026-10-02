"use client";

import { CheckCircle2, ChefHat, Loader2, RefreshCw, Utensils } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, BTN, BTN_DANGER, BTN_PRIMARY, money } from "./shared";

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
    <div className="desk-menu-screen">
      <section className="desk-menu-heading">
        <div>
          <span className="desk-menu-eyebrow"><ChefHat size={14} /> RESTAURANT MENU</span>
          <h2>Meals &amp; availability</h2>
          <p>View meal photos and prices, and update availability as the kitchen needs.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="desk-menu-count">
            {items.length} dishes · <strong>{soldOut}</strong> sold out
          </span>
          <button className={BTN} onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh
          </button>
        </div>
      </section>

      <p className="desk-menu-permission-note">
        <Utensils size={15} />
        <span>Front desk access: meal details and prices are view-only. You can mark a dish sold out or put it back on sale; menu edits stay with managers.</span>
      </p>

      {categories.map((category) => (
        <section key={category} className="desk-menu-category">
          <div className="desk-menu-category-heading">
            <h3>{category}</h3>
            <span>{items.filter((item) => item.category === category).length} items</span>
          </div>
          <div className="desk-menu-grid">
            {items
              .filter((item) => item.category === category)
              .map((item) => (
                <article key={item.id} className={`desk-meal-card ${item.isAvailable ? "" : "is-sold-out"}`}>
                  <div className="desk-meal-image">
                    <span className="desk-meal-image-fallback" aria-hidden="true"><ChefHat size={25} /></span>
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        loading="lazy"
                        onError={(event) => { event.currentTarget.hidden = true; }}
                      />
                    )}
                    {item.isSpecial && <span className="desk-meal-special">House special</span>}
                    {!item.isAvailable && <span className="desk-meal-sold-badge">Sold out</span>}
                  </div>
                  <div className="desk-meal-content">
                    <div className="desk-meal-title-row">
                      <h4>{item.name}</h4>
                      <strong className="desk-meal-price">{money(item.price)}</strong>
                    </div>
                    <p className="desk-meal-description">{item.description || "A Sunrise Motel menu favourite."}</p>
                    <div className="desk-meal-footer">
                      <span className={`desk-meal-availability ${item.isAvailable ? "is-available" : "is-unavailable"}`}>
                        <span />{item.isAvailable ? "Available to order" : "Currently sold out"}
                      </span>
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
                          {item.isAvailable ? "Mark sold out" : "Put on sale"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
          </div>
        </section>
      ))}

      {!loading && items.length === 0 && (
        <p className="desk-menu-empty">
          No dishes are in the menu table yet — seed or add them from the admin portal.
        </p>
      )}
    </div>
  );
}