import type { Metadata } from "next";
import DeskConsole from "@/components/desk/desk-console";

export const metadata: Metadata = {
  title: "Front desk & admin console | Sunrise Motel",
  description: "Arrivals, room map, orders, guest issues, payments and folios in one place.",
  robots: { index: false, follow: false },
};

/**
 * The v2 front desk / admin console. Everything in one signed-in shell so the
 * desk can work the day from a phone: Today board, room map, order board, issue
 * queue, housekeeping, money and the guest CRM.
 */
export default function DeskPage() {
  return <DeskConsole />;
}
