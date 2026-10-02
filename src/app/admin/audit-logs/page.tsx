import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AuditLogViewer from "@/components/admin/audit-log-viewer";
import { AdminPageFrame } from "@/components/admin/admin-navigation";
import { isSuperAdminRole, readSession } from "@/lib/staff-auth";

export const metadata: Metadata = { title: "Audit log | Sunrise Motel Admin", robots: { index: false, follow: false } };

export default async function AuditLogsPage() {
  const request = new Request("https://sunrise.local/admin/audit-logs", { headers: await headers() });
  const user = await readSession(request);
  if (!user) redirect("/admin/login");
  if (!isSuperAdminRole(user.role)) redirect("/admin");
  return <AdminPageFrame><AuditLogViewer /></AdminPageFrame>;
}