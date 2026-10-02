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

  const activeUsers = users.filter((user) => user.status === "active").length;
  const inactiveUsers = users.filter((user) => user.status !== "active").length;
  const openInvitations = invitations.filter((invite) => !["accepted", "revoked"].includes(invite.status)).length;
  const failedInvitations = invitations.filter((invite) => invite.status === "failed" || Boolean(invite.deliveryError)).length;

  if (error && users.length === 0) return <main className="admin-page"><section className="admin-content-section"><p role="alert">{error}</p></section></main>;

  return (
    <main className="admin-page">
      <header className="admin-page-header admin-users-header">
        <div>
          <p className="eyebrow"><span className="eyebrow-line" /> PEOPLE &amp; ACCESS</p>
          <h1>Users</h1>
          <p>Staff accounts, invitations and access roles.</p>
        </div>
        <a className="admin-btn" href="/admin"><Users size={15} /> Admin dashboard</a>
      </header>
      <div className="admin-users-content">
        {error && <p className="admin-alert admin-alert-error" role="alert">{error}</p>}
        {notice && <p className="admin-alert admin-alert-success" role="status">{notice}</p>}

        <section className="user-access-overview" aria-label="Access summary">
          <div className="user-access-stat user-access-stat-active"><span className="user-access-stat-icon"><Check size={16} /></span><div><small>Active accounts</small><strong>{activeUsers}</strong></div></div>
          <div className="user-access-stat"><span className="user-access-stat-icon"><Users size={16} /></span><div><small>Other statuses</small><strong>{inactiveUsers}</strong></div></div>
          {canManage ? <div className="user-access-stat user-access-stat-invites"><span className="user-access-stat-icon"><Mail size={16} /></span><div><small>Open invitations</small><strong>{openInvitations}</strong></div></div> : null}
          {canManage ? <div className={`user-access-stat ${failedInvitations ? "user-access-stat-warning" : ""}`}><span className="user-access-stat-icon"><Clock3 size={16} /></span><div><small>Delivery issues</small><strong>{failedInvitations}</strong></div></div> : null}
        </section>

        {canManage ? (
          <section className="user-invite-panel" aria-labelledby="user-invite-heading">
            <div className="user-invite-panel-heading">
              <span className="user-invite-icon"><Plus size={18} /></span>
              <div><p className="user-section-kicker">NEW TEAM MEMBER</p><h2 id="user-invite-heading">Invite a user</h2><p>Setup links expire after 7 days and can only be used once.</p></div>
              <button className="admin-btn user-bulk-invite" type="button" disabled={busy} onClick={() => void inviteAll()}><Mail size={14} /> Invite all 3 defaults</button>
            </div>
            <form className="admin-modal-form user-invite-form" onSubmit={invite}>
              <label><span>Full name</span><input required minLength={2} maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label><span>Email address</span><input required type="email" maxLength={180} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label><span>Access role</span><select value={role} onChange={(event) => setRole(event.target.value)}>{ROLES.map((item) => <option value={item} key={item}>{roleName(item)}</option>)}</select></label>
              <button className="admin-btn admin-btn-primary" type="submit" disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Send invite</button>
            </form>
          </section>
        ) : <p className="user-readonly-note"><Shield size={15} /> Read-only directory. User access is managed by a Super Admin.</p>}

        <section className="user-section" aria-labelledby="staff-directory-heading">
          <div className="user-section-heading"><div><p className="user-section-kicker">TEAM</p><h2 id="staff-directory-heading">Staff directory</h2><p>{canManage ? "Access changes take effect immediately and are recorded in the audit trail." : "Read-only staff directory."}</p></div><button className="admin-btn" type="button" disabled={busy} onClick={() => void load()}><RefreshCw size={14} /> Refresh</button></div>
          <div className="user-directory-list">
            {users.map((user) => (
              <article className="user-directory-row" key={user.id}>
                <span className="user-avatar" aria-hidden="true">{user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
                <div className="user-directory-identity"><strong>{user.name}</strong><small>{user.email ?? "Email visible to Super Admin only"}{user.invitedBy ? ` · invited by ${user.invitedBy}` : ""}</small></div>
                <div className="user-directory-role"><span className={`user-role-chip user-role-${user.role.replaceAll("_", "-")}`}>{roleName(user.role)}</span><small className={`user-status user-status-${user.status.replaceAll("_", "-")}`}>{user.status.replaceAll("_", " ")}</small></div>
                <small className="user-last-login">{user.lastLogin ? `Last login ${new Date(user.lastLogin).toLocaleString()}` : "Never signed in"}</small>
                {canManage ? <div className="user-row-actions">
                  <select aria-label={`Change role for ${user.name}`} value={user.role} disabled={busy || user.status === "deleted"} onChange={(event) => void post("PATCH", { action: "role", id: user.id, role: event.target.value })}>{ROLES.map((item) => <option value={item} key={item}>{roleName(item)}</option>)}</select>
                  {user.status === "active" ? <button className="btn-action" type="button" disabled={busy} onClick={() => userAction(user, "deactivate")}><UserRoundX size={14} /> Deactivate</button> : user.status === "deactivated" ? <button className="btn-action" type="button" disabled={busy} onClick={() => userAction(user, "activate")}><Check size={14} /> Activate</button> : null}
                  {user.status !== "deleted" ? <button className="btn-action btn-danger-text" type="button" disabled={busy} onClick={() => userAction(user, "delete")}><Trash2 size={14} /> Delete</button> : null}
                </div> : null}
              </article>
            ))}
            {users.length === 0 ? <p className="empty-state">No staff accounts found.</p> : null}
          </div>
        </section>

        {canManage ? <section className="user-section" aria-labelledby="invitation-heading">
          <div className="user-section-heading"><div><p className="user-section-kicker">DELIVERY QUEUE</p><h2 id="invitation-heading">Invitations</h2><p>Failed deliveries can be retried after email service is restored.</p></div><span className="user-section-count">{openInvitations} open</span></div>
          <div className="user-invitation-list">
            {invitations.map((invite) => (
              <article className={`user-invitation-row ${invite.deliveryError ? "has-delivery-error" : ""}`} key={invite.id}>
                <span className="user-avatar user-avatar-invite" aria-hidden="true"><Mail size={16} /></span>
                <div className="user-directory-identity"><strong>{invite.name}</strong><small>{invite.email} · invited by {invite.invitedByName}</small></div>
                <div className="user-directory-role"><span className={`user-role-chip user-role-${invite.role.replaceAll("_", "-")}`}>{roleName(invite.role)}</span><small className={`user-status user-status-${invite.status.replaceAll("_", "-")}`}>{invite.status.replaceAll("_", " ")}</small></div>
                <div className="user-invitation-meta"><small>Expires {new Date(invite.expiresAt).toLocaleString()}</small>{invite.deliveryError ? <small className="user-delivery-error">{invite.deliveryError}</small> : null}{invite.deliveryError && invite.updatedAt ? <small>Last attempt {new Date(invite.updatedAt).toLocaleString()}</small> : null}</div>
                <div className="user-row-actions">
                  {invite.status !== "accepted" && invite.status !== "revoked" ? <button className="btn-action" type="button" disabled={busy} onClick={() => void post("PATCH", { action: "resend", id: invite.id })}><RefreshCw size={14} /> {invite.status === "failed" ? "Retry send" : "Resend"}</button> : null}
                  {invite.status !== "accepted" && invite.status !== "revoked" ? <button className="btn-action" type="button" disabled={busy} onClick={() => void copyLink(invite)}><Copy size={14} /> Copy link</button> : null}
                  {invite.status !== "accepted" && invite.status !== "revoked" ? <button className="btn-action btn-danger-text" type="button" disabled={busy} onClick={() => void revoke(invite)}><X size={14} /> Revoke</button> : null}
                </div>
              </article>
            ))}
            {invitations.length === 0 ? <p className="empty-state">No invitations yet.</p> : null}
          </div>
        </section> : null}
        <footer className="admin-foot"><Shield size={13} /> Super Admin actions only · audit trail records every change</footer>
      </div>
    </main>
  );
}