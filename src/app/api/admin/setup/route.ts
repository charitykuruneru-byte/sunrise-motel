// The brief calls this URL /api/admin/setup; the page that uses it has always been
// /setup-account and /api/invitations/setup. Rather than a second implementation,
// this route hands the request to the original handlers: one token check, one
// account-creation path, one place to fix.
export { GET, POST } from "@/app/api/invitations/setup/route";

export const dynamic = "force-dynamic";
