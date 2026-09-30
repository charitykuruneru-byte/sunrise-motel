import { redirect } from "next/navigation";

export default function LoginPage() {
  redirect("/app?message=invite-only");
}