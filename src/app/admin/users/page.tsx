import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import UserManagement from "@/components/admin/user-management";
import { AdminPageFrame } from "@/components/admin/admin-navigation";
import { isManagerRole, readSession } from "@/lib/staff-auth";

export const metadata: Metadata = { title: "Users | Sunrise Motel Admin", robots: { index: false, follow: false } };

export default async function UsersPage() {
  const request = new Request("https://sunrise.local/admin/users", { headers: await headers() });
  const user = await readSession(request);
  if (!user) redirect("/admin/login");
  if (!isManagerRole(user.role)) redirect("/admin");
  return (
    <AdminPageFrame canViewUsers isMotelManager={["admin", "super_admin", "motel_manager"].includes(user.role)}>
      <UserManagement />
    </AdminPageFrame>
  );
}