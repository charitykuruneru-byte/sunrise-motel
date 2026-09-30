"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, Copy, Loader2, Mail, Plus, RefreshCw, Shield, Trash2, UserRoundX, Users, X } from "lucide-react";

type UserRow = { id: string; name: string; email?: string; role: string; invitedBy?: string | null; status: string; lastLogin?: string | null; createdAt?: string };
type InviteRow = { id: string; email: string; name: string; role: string; accountType: string; invitedByName: string; status: string; expiresAt: string; deliveryError: string | null; updatedAt: string | null };
const ROLES = ["super_admin", "admin", "motel_manager", "restaurant_manager", "staff"];
const roleName = (role: string) => ({ super_admin: "Super Admin", admin: "Administrator", motel_manager: "Motel Manager", restaurant_manager: "Restaurant Manager", staff: "Front Desk Staff" }[role] ?? role);

export default function UserManagement() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invitations, setInvitations] = useState<InviteRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("staff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/invitations", { cache: "no-store" });
    const data = (await response.json()) as { users?: UserRow[]; invitations?: InviteRow[]; canManage?: boolean; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not load users.");
    setUsers(data.users ?? []);
    setInvitations(data.invitations ?? []);
    setCanManage(data.canManage ?? false);
  }, []);

  useEffect(() => { void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load users.")); }, [load]);

  const post = async (method: "POST" | "PATCH", payload: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/invitations", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await response.json()) as { error?: string; emailSent?: boolean; reason?: string };
      if (!response.ok) throw new Error(data.error ?? "Action failed.");
      setNotice(data.emailSent === false ? `Saved, but email was not sent: ${data.reason ?? "check SMTP configuration"}` : "Changes saved.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    await post("POST", { name, email, role });
    setName("");
    setEmail("");
    setRole("staff");
  };

  // The brief, as one button: invite every address on file. The list itself lives on
  // the server (src/lib/staff-invite.ts → DEFAULT_ADMIN_INVITES), so the three
  // addresses are not typed out again here where they could drift.
  const inviteAll = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/invite/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = (await response.json()) as {
        error?: string;
        sent?: number;
        failed?: number;
        results?: { email: string; status: string; emailSent: boolean; reason?: string | null }[];
      };
      if (!response.ok) throw new Error(data.error ?? "Could not send the invitations.");
      const detail = (data.results ?? [])
        .map((row) => `${row.email} — ${row.status}${row.emailSent ? " (email sent)" : row.reason ? ` (${row.reason})` : ""}`)
        .join(" · ");
      setNotice(`${data.sent ?? 0} handled, ${data.failed ?? 0} failed. ${detail}`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the invitations.");
    } finally {
      setBusy(false);
    }
  };

  // A fresh single-use link WITHOUT sending another email — for the days a mailbox
  // misbehaves and the manager would rather hand the link over themselves. The
  // previous link stops working, which is said out loud rather than discovered.
  const copyLink = async (invite: InviteRow) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/invitations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend", id: invite.id, notify: false }),
      });
      const data = (await response.json()) as { error?: string; inviteLink?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not create a fresh link.");
      const link = data.inviteLink;
      if (!link) {
        setNotice("A fresh link was created but the server did not return it — press Resend instead.");
      } else {
        let copied = false;
        try {
          await navigator.clipboard.writeText(link);
          copied = true;
        } catch {
          copied = false;
        }
        setNotice(copied ? `Fresh link for ${invite.email} copied. The previous link no longer works.` : `Fresh link for ${invite.email} (previous one no longer works): ${link}`);
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create a fresh link.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (invite: InviteRow) => {
    if (!window.confirm(`Revoke the invitation for ${invite.email}?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/invitations?id=${encodeURIComponent(invite.id)}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not revoke invitation.");
      setNotice("Invitation revoked.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not revoke invitation.");
    } finally {
      setBusy(false);
    }
  };

  const userAction = (user: UserRow, action: string) => {
    const messages: Record<string, string> = {
      deactivate: `Are you sure you want to deactivate ${user.name}? They will lose access immediately.`,
      delete: `Soft-delete ${user.name}? This deactivates access and preserves their audit history.`,
    };
    if (messages[action] && !window.confirm(messages[action])) return;
    void post("PATCH", { action, id: user.id });
  };

  if (error && users.length === 0) return <main className="admin-page"><section className="admin-content-section"><p role="alert">{error}</p></section></main>;

  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div><p className="eyebrow"><span className="eyebrow-line" /> ACCOUNT CONTROL</p><h1>Users</h1><p>Invitations, access and roles for Sunrise Motel.</p></div>
        <a className="admin-btn" href="/admin"><Users size={15} /> Admin dashboard</a>
      </header>
      {error && <p className="admin-alert admin-alert-error" role="alert">{error}</p>}
      {notice && <p className="admin-alert admin-alert-success" role="status">{notice}</p>}

      {canManage ? (
        <section className="admin-content-section">
          <div className="section-toolbar"><div className="toolbar-info"><h2>Invite a user</h2><p>Setup links expire after 7 days and can only be used once.</p></div><button className="admin-btn" type="button" disabled={busy} onClick={() => void inviteAll()}><Mail size={14} /> Invite all 3 default emails</button></div>
          <form className="admin-modal-form admin-inline-form" onSubmit={invite}>
            <div className="form-grid-2">
              <label><span>Full name</span><input required minLength={2} maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label><span>Email</span><input required type="email" maxLength={180} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            </div>
            <label><span>Role</span><select value={role} onChange={(event) => setRole(event.target.value)}>{ROLES.map((item) => <option value={item} key={item}>{roleName(item)}</option>)}</select></label>
            <button className="admin-btn admin-btn-primary" type="submit" disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Send invite</button>
          </form>
        </section>
      ) : null}

      <section className="admin-content-section">
        <div className="section-toolbar"><div className="toolbar-info"><h2>Staff accounts</h2><p>{canManage ? "Access changes are immediate and are recorded in the audit trail." : "Read-only staff directory."}</p></div></div>
        <div className="invoice-list">
          {users.map((user) => (
            <div className="invoice-row" key={user.id}>
              <div><strong>{user.name}</strong><small>{user.email ?? "Email visible to Super Admin only"}{user.invitedBy ? ` · invited by ${user.invitedBy}` : ""}</small></div>
              <div><strong>{roleName(user.role)}</strong><small>{user.status}{user.lastLogin ? ` · last login ${new Date(user.lastLogin).toLocaleString()}` : " · never signed in"}</small></div>
              {canManage ? <div className="invoice-actions">
                <select aria-label={`Change role for ${user.name}`} value={user.role} disabled={busy || user.status === "deleted"} onChange={(event) => void post("PATCH", { action: "role", id: user.id, role: event.target.value })}>{ROLES.map((item) => <option value={item} key={item}>{roleName(item)}</option>)}</select>
                {user.status === "active" ? <button className="btn-action" type="button" disabled={busy} onClick={() => userAction(user, "deactivate")}><UserRoundX size={14} /> Deactivate</button> : user.status === "deactivated" ? <button className="btn-action" type="button" disabled={busy} onClick={() => userAction(user, "activate")}><Check size={14} /> Activate</button> : null}
                {user.status !== "deleted" ? <button className="btn-action btn-danger-text" type="button" disabled={busy} onClick={() => userAction(user, "delete")}><Trash2 size={14} /> Delete</button> : null}
              </div> : null}
            </div>
          ))}
          {users.length === 0 ? <p className="empty-state">No staff accounts found.</p> : null}
        </div>
      </section>

      {canManage ? <section className="admin-content-section">
        <div className="section-toolbar"><div className="toolbar-info"><h2>Invitations</h2><p>Failed deliveries can be retried after email service is restored.</p></div><button className="admin-btn" type="button" disabled={busy} onClick={() => void load()}><RefreshCw size={14} /> Refresh</button></div>
        <div className="invoice-list">
          {invitations.map((invite) => (
            <div className="invoice-row" key={invite.id}>
              <div><strong>{invite.name}</strong><small>{invite.email} · invited by {invite.invitedByName}</small></div>
              <div><strong>{roleName(invite.role)}</strong><small><Clock3 size={12} /> {invite.status} · expires {new Date(invite.expiresAt).toLocaleString()}</small>{invite.deliveryError ? <small>{invite.deliveryError}</small> : null}{invite.deliveryError && invite.updatedAt ? <small>Last attempt {new Date(invite.updatedAt).toLocaleString()} — press Retry send to deliver it now.</small> : null}</div>
              <div className="invoice-actions">
                {invite.status !== "accepted" && invite.status !== "revoked" ? <button className="btn-action" type="button" disabled={busy} onClick={() => void post("PATCH", { action: "resend", id: invite.id })}><RefreshCw size={14} /> {invite.status === "failed" ? "Retry send" : "Resend"}</button> : null}
                {invite.status !== "accepted" && invite.status !== "revoked" ? <button className="btn-action" type="button" disabled={busy} onClick={() => void copyLink(invite)}><Copy size={14} /> Copy link</button> : null}
                {invite.status !== "accepted" && invite.status !== "revoked" ? <button className="btn-action btn-danger-text" type="button" disabled={busy} onClick={() => void revoke(invite)}><X size={14} /> Revoke</button> : null}
              </div>
            </div>
          ))}
          {invitations.length === 0 ? <p className="empty-state">No invitations yet.</p> : null}
        </div>
      </section> : null}
      <footer className="admin-foot"><Shield size={13} /> Super Admin actions only · audit trail records every change</footer>
    </main>
  );
}