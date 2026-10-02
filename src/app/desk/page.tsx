import type { Metadata } from "next";
import DeskConsole from "@/components/desk/desk-console";

// Live data: never prerendered — see src/lib/revalidate.ts
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Front desk | Sunrise Motel",
  description: "A clear workspace for guest arrivals, rooms, service requests and payments.",
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
