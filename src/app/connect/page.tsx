import { ConnectPage } from "@/components/experience-pages";

// Live data: never prerendered — see src/lib/revalidate.ts
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Connect | Sunrise Motel Lilongwe",
  description: "Find a reliable coffee, work and meeting space at Sunrise Motel in Area 5, Lilongwe.",
};

export default function ConnectRoute() {
  return <ConnectPage />;
}
