import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * /admin/setup — the URL in the invitation brief, kept working.
 *
 * The real page is /setup-account (it is shared with guest invitations, and it is
 * the URL the email links to). This route forwards to it with the token intact, so
 * both spellings behave identically instead of one of them being a 404.
 */
export default async function AdminSetupPage({ searchParams }: { searchParams: Promise<{ token?: string; email?: string }> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.token) query.set("token", params.token);
  if (params.email) query.set("email", params.email);
  const suffix = query.toString();
  redirect(`/setup-account${suffix ? `?${suffix}` : ""}`);
}
