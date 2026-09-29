import { DinePage } from "@/components/experience-pages";
import type { DineItem } from "@/components/experience-pages";
import { db } from "@/db";
import { menuItemsTable } from "@/db/schema";

export const metadata = {
  title: "Dine | Sunrise Motel Lilongwe",
  description: "Browse the Sunrise Motel menu and send a structured dine-in, pickup or room-service request.",
};

export const dynamic = "force-dynamic";

/**
 * ADDENDUM (staff dashboard §15.1): the menu the guest reads is now the SAME `menu_items` table the
 * desk closes a dish on. Before this, `/dine` rendered a hard-coded array and the sold-out toggle
 * changed nothing a guest could see. Prices and availability come from the database; if it cannot
 * be reached, the page falls back to the built-in list so the menu never disappears.
 */
export default async function DineRoute() {
  let items: DineItem[] | undefined;
  try {
    const rows = await db.select().from(menuItemsTable);
    if (rows.length > 0) {
      items = rows.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        description: row.description,
        price: row.price,
        img: row.imageUrl,
        isAvailable: row.isAvailable,
      }));
    }
  } catch {
    // Database unavailable — fall through to the built-in menu below.
  }
  return <DinePage items={items} />;
}
