import { StayPage } from "@/components/experience-pages";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Stay | Sunrise Motel Lilongwe",
  description: "Browse Sunrise Motel rooms, compare dates and request your Lilongwe stay without an account.",
};

export default function StayRoute() {
  return <StayPage />;
}
