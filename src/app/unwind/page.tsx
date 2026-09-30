import { UnwindPage } from "@/components/experience-pages";

// Live data: never prerendered — see src/lib/revalidate.ts
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Unwind | Sunrise Motel Lilongwe",
  description: "See what is on at Sunrise Motel: happy hour, braai days and easy evenings in Area 5.",
};

export default function UnwindRoute() {
  return <UnwindPage />;
}
