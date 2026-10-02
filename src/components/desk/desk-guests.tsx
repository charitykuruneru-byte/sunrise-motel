"use client";

import { Loader2, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import DeskDialog from "./desk-dialog";
import { api, BTN, BTN_PRIMARY, CARD, INPUT, money } from "./shared";

type Account = {
  id: string;
  loginEmail: string | null;
  loginPhone: string | null;
  status: string;
  phoneVerified: boolean;
  marketingConsent: boolean;
  lastLoginAt: string | null;
  invitedByLabel: string | null;
};

type GuestRow = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  country: string | null;
  notes: string | null;
  stayCount: number;
  totalSpent: number;
  isRegular: boolean;
  isNoShow: boolean;
  marketingConsent: boolean;
  lastStay: { reference: string; checkIn: string; checkOut: string; status: string; roomNumber: string | null } | null;
  accounts: Account[];
  invitation: { email: string; status: string } | null;
  activeStay: { id: string; reference: string; checkIn: string; checkOut: string; status: string } | null;
};

export default function DeskGuests({
  setToast,
  onChanged,
  readOnly,
  isAdmin,
}: {
  setToast: (message: string) => void;
  onChanged: () => Promise<void>;
  readOnly: boolean;
  /**
   * ADDENDUM (staff dashboard §10.4–§10.5): staff invite an account, resend a link and set a
   * password at the desk — and never see or change the email, credentials, devices or marketing
   * consent. The status and consent controls below render only for an admin session.
   */
  isAdmin: boolean;
}) {
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    regulars: 0,
    appAccounts: 0,
    activated: 0,
    invitedNotActivated: 0,
    optedIn: 0,
  });
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteGuest, setInviteGuest] = useState<GuestRow | null>(null);
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [guestForm, setGuestForm] = useState({ fullName: "", email: "", phone: "", country: "", notes: "" });
  const [emailFor, setEmailFor] = useState<Record<string, string>>({});
  const [deskPassword, setDeskPassword] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const data = await api<{ guests: GuestRow[]; stats: typeof stats }>("/api/desk/guests");
    setGuests(data.guests);
    setStats(data.stats);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async <T,>(label: string, work: () => Promise<T>, resultLabel?: (result: T) => string) => {
    if (readOnly) return false;
    setBusy(true);
    try {
      const result = await work();
      await load();
      await onChanged();
      setToast(resultLabel ? resultLabel(result) : label);
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "That action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const invite = (guest: GuestRow) =>
    run("Guest invitation sent. The guest can set their own password from the email.", async () => {
      if (guest.activeStay?.status !== "checked_in") throw new Error("Guest accounts can only be invited after check-in.");
      const email = (emailFor[guest.id] ?? guest.email ?? "").trim();
      if (!email) throw new Error("Capture the guest's email address after check-in.");
      return api<{
        result: {
          existingAccount: boolean;
          emailSent: boolean;
          emailReason: string | null;
        };
      }>("/api/desk/guests", {
        method: "POST",
        body: JSON.stringify({
          action: "invite",
          bookingId: guest.activeStay.id,
          login: email,
        }),
      });
    }, (data) => {
      if (data.result.existingAccount) {
        return data.result.emailSent
          ? "Returning guest linked to their existing account; a sign-in email was sent."
          : "Returning guest linked to their existing account, but email could not be sent. Ask an administrator to check email delivery.";
      }
      return data.result.emailSent
        ? "Guest setup email sent. They can choose their own password from the secure link."
        : `Invitation saved, but setup email could not be sent (${data.result.emailReason ?? "email delivery unavailable"}). Ask an administrator to restore email and resend it.`;
    });

  const submitInvitation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inviteGuest) return;
    if (await invite(inviteGuest)) setInviteGuest(null);
  };

  const submitGuest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const succeeded = await run(
      "Guest profile saved.",
      () =>
        api<{
          result: {
            existingAccount: boolean;
            alreadyActive: boolean;
            emailSent: boolean;
            emailReason: string | null;
          };
        }>("/api/desk/guests", {
          method: "POST",
          body: JSON.stringify({ action: "add_guest", ...guestForm }),
        }),
      (data) => {
        if (data.result.alreadyActive) return "Guest details saved; this email already has an active app account.";
        if (data.result.existingAccount) {
          return data.result.emailSent
            ? "Guest details saved and a fresh setup email was sent."
            : `Guest details saved, but the setup email could not be sent (${data.result.emailReason ?? "email delivery unavailable"}).`;
        }
        return data.result.emailSent
          ? "Guest added and setup email sent. They can choose their own password from the secure link."
          : `Guest added, but the setup email could not be sent (${data.result.emailReason ?? "email delivery unavailable"}). You can resend it from the guest record.`;
      },
    );
    if (succeeded) {
      setShowAddGuest(false);
      setEditingGuestId(null);
      setGuestForm({ fullName: "", email: "", phone: "", country: "", notes: "" });
    }
  };

  const openGuestForm = (guest?: GuestRow) => {
    setEditingGuestId(guest?.id ?? null);
    setGuestForm({
      fullName: guest?.fullName ?? "",
      email: guest?.invitation?.email ?? guest?.email ?? "",
      phone: guest?.phone ?? "",
      country: guest?.country ?? "",
      notes: guest?.notes ?? "",
    });
    setShowAddGuest(true);
  };

  const accountAction = (account: Account, action: string, extra: Record<string, unknown> = {}, label = "Saved.") =>
    run(label, () =>
      api("/api/desk/guests", { method: "POST", body: JSON.stringify({ accountId: account.id, action, ...extra }) }),
    );

  const filtered = guests.filter((guest) => {
    if (!query.trim()) return true;
    return `${guest.fullName} ${guest.phone ?? ""} ${guest.email ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  });
  const checkedInGuestsNeedingAccess = guests.filter(
    (guest) =>
      guest.activeStay?.status === "checked_in" &&
      !guest.accounts.some((account) => account.status === "active"),
  );
  return (
    <div className="space-y-4">
      <section className={`${CARD} space-y-3`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#f8c66b]">Guest app access</p>
          <h3 className="mt-1 text-sm font-bold">Add a guest and send account setup</h3>
          <p className="mt-1 text-xs text-white/55">
            Add guest details and their email here, even before a booking is checked in. They set their own password from the secure link.
          </p>
        </div>
        {!readOnly && (
          <button className={BTN_PRIMARY} type="button" disabled={busy} onClick={() => openGuestForm()}>
            <UserPlus size={14} /> Add guest
          </button>
        )}
        {checkedInGuestsNeedingAccess.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/55">
            No checked-in guests are waiting for app access. Use “Add guest” to enter a guest’s details and email now.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {checkedInGuestsNeedingAccess.map((guest) => {
              const pendingAccount = guest.accounts.find((account) => account.status !== "active");
              const email = pendingAccount?.loginEmail ?? guest.invitation?.email ?? guest.email ?? "";
              const hasPendingInvitation = guest.invitation?.status === "pending";
              return (
                <div key={guest.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white">{guest.fullName}</p>
                    <p className="truncate text-[11px] text-white/55">
                      {email || "Email needed"} · {guest.activeStay?.reference}
                    </p>
                    {pendingAccount && (
                      <p className="mt-0.5 text-[10px] capitalize text-amber-200">
                        Setup {pendingAccount.status.replaceAll("_", " ")}
                      </p>
                    )}
                    {!pendingAccount && guest.invitation && (
                      <p className="mt-0.5 text-[10px] capitalize text-amber-200">
                        Invitation {guest.invitation.status.replaceAll("_", " ")}
                      </p>
                    )}
                  </div>
                  <button
                    className={BTN_PRIMARY}
                    type="button"
                    disabled={busy || readOnly}
                    onClick={() => {
                      setEmailFor((emails) => ({ ...emails, [guest.id]: email }));
                      setInviteGuest(guest);
                    }}
                  >
                    {pendingAccount || hasPendingInvitation ? "Resend setup email" : "Invite to app"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Users size={16} className="text-[#f8c66b]" /> Guests (CRM)
        </h2>
        <span className="text-[11px] text-white/50">
          {stats.total} guests · {stats.regulars} regulars · {stats.appAccounts} app accounts ({stats.activated} active,{" "}
          {stats.invitedNotActivated} invited not activated) · {stats.optedIn} opted in to offers
        </span>
        <input
          className={`${INPUT} ml-auto max-w-[240px]`}
          placeholder="Search name, phone or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </section>

      <section className="space-y-2">
        {filtered.length === 0 && <p className="text-[11px] text-white/40">No guests match that search.</p>}
        {filtered.slice(0, 60).map((guest) => (
          <div key={guest.id} className={CARD}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold">
                  {guest.fullName}
                  {guest.isRegular && (
                    <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-200">
                      REGULAR
                    </span>
                  )}
                  {guest.isNoShow && (
                    <span className="ml-2 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-200">NO-SHOW</span>
                  )}
                </p>
                <p className="text-[11px] text-white/60">
                  {guest.phone ?? "no phone"} · {guest.email ?? "no email"} · {guest.stayCount} stay(s) ·{" "}
                  {money(guest.totalSpent)} lifetime
                  {guest.lastStay ? ` · last ${guest.lastStay.checkOut} (${guest.lastStay.status.replace("_", " ")})` : ""}
                </p>
                {guest.activeStay && (
                  <p className="text-[11px] text-[#f8c66b]">
                    Active stay {guest.activeStay.reference} · {guest.activeStay.checkIn} → {guest.activeStay.checkOut} ·{" "}
                    {guest.activeStay.status.replace("_", " ")}
                  </p>
                )}
                {!guest.activeStay && guest.invitation && (
                  <p className="text-[11px] capitalize text-amber-200">
                    App invitation {guest.invitation.status.replaceAll("_", " ")}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!readOnly && guest.invitation && !guest.accounts.some((account) => account.status === "active") && (
                  <button className={BTN} type="button" disabled={busy} onClick={() => openGuestForm(guest)}>
                    Resend setup email
                  </button>
                )}
                {!readOnly && guest.activeStay?.status === "checked_in" && !guest.accounts.some((a) => a.status === "active") && (
                  <button
                    className={BTN_PRIMARY}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEmailFor((emails) => ({ ...emails, [guest.id]: emails[guest.id] ?? guest.email ?? "" }));
                      setInviteGuest(guest);
                    }}
                  >
                    Invite guest to the app
                  </button>
                )}
              </div>
            </div>
            {guest.accounts.length > 0 && (
              <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2">
                {guest.accounts.map((account) => (
                  <div key={account.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span>
                      <strong>{account.loginEmail ?? account.loginPhone}</strong> · {account.status}
                      {account.phoneVerified ? " · phone verified" : ""}
                      {isAdmin && account.marketingConsent ? " · offers opted in" : ""}
                      {account.lastLoginAt
                        ? ` · last sign-in ${new Date(account.lastLoginAt).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : " · never signed in"}
                      {account.invitedByLabel ? ` · invited by ${account.invitedByLabel}` : ""}
                    </span>
                    {!readOnly && (
                      <span className="flex flex-wrap items-center gap-1.5">
                        {account.status !== "active" && (
                          <button
                            className={BTN}
                            disabled={busy}
                            onClick={() => accountAction(account, "resend", {}, "Fresh activation link issued.")}
                          >
                            Resend invite
                          </button>
                        )}
                        <input
                          className={`${INPUT} max-w-[150px]`}
                          placeholder="set password"
                          value={deskPassword[account.id] ?? ""}
                          onChange={(e) => setDeskPassword({ ...deskPassword, [account.id]: e.target.value })}
                        />
                        <button
                          className={BTN_PRIMARY}
                          disabled={busy || !(deskPassword[account.id] ?? "").trim()}
                          onClick={() =>
                            accountAction(
                              account,
                              "activate_at_desk",
                              { password: deskPassword[account.id] },
                              "Password set at the desk — the guest can sign in now.",
                            )
                          }
                        >
                          Activate at desk
                        </button>
                        {/* ADDENDUM (§10.5): mute, consent and disable are admin actions. */}
                        {isAdmin && (
                          <>
                        <button
                          className={BTN}
                          disabled={busy}
                          onClick={() =>
                            accountAction(
                              account,
                              "set_status",
                              { status: account.status === "messaging_muted" ? "active" : "messaging_muted" },
                              account.status === "messaging_muted"
                                ? "Messaging unmuted."
                                : "Messaging muted — they can still order and see the bill.",
                            )
                          }
                        >
                          {account.status === "messaging_muted" ? "Unmute" : "Mute messaging"}
                        </button>
                        <button
                          className={BTN}
                          disabled={busy}
                          onClick={() =>
                            accountAction(
                              account,
                              "set_consent",
                              { consent: !account.marketingConsent },
                              "Marketing consent updated.",
                            )
                          }
                        >
                          {account.marketingConsent ? "Opt out of offers" : "Opt in to offers"}
                        </button>
                        <button
                          className={BTN}
                          disabled={busy}
                          onClick={() =>
                            accountAction(
                              account,
                              "set_status",
                              { status: account.status === "disabled" ? "active" : "disabled" },
                              account.status === "disabled" ? "Account re-enabled." : "Account disabled.",
                            )
                          }
                        >
                          {account.status === "disabled" ? "Enable" : "Disable"}
                        </button>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>
      {inviteGuest && !readOnly && (
        <DeskDialog
          title={`Invite ${inviteGuest.fullName}`}
          description="Send a secure account setup link. The guest chooses their own password from the email."
          onClose={() => { if (!busy) setInviteGuest(null); }}
        >
          <form className="grid gap-4" onSubmit={submitInvitation}>
            <label className="grid gap-1.5 text-xs font-semibold text-white/80">
              Guest email *
              <input
                className={INPUT}
                autoFocus
                type="email"
                required
                maxLength={180}
                autoComplete="email"
                value={emailFor[inviteGuest.id] ?? ""}
                onChange={(event) => setEmailFor((emails) => ({ ...emails, [inviteGuest.id]: event.target.value }))}
                placeholder="guest@example.com"
              />
            </label>
            <p className="text-[11px] leading-relaxed text-white/55">
              This invitation is only available after check-in. If the guest already has an account, the stay will be linked without creating a duplicate.
            </p>
            <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
              <button className={BTN} type="button" disabled={busy} onClick={() => setInviteGuest(null)}>Cancel</button>
              <button className={BTN_PRIMARY} type="submit" disabled={busy || !(emailFor[inviteGuest.id] ?? "").trim()}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : null} Send invitation
              </button>
            </div>
          </form>
        </DeskDialog>
      )}
      {showAddGuest && !readOnly && (
        <DeskDialog
          title={editingGuestId ? "Update guest and resend setup email" : "Add guest and send setup email"}
          description="Enter the guest’s details. We’ll email a secure account setup link; the guest creates their own password."
          onClose={() => {
            if (!busy) {
              setShowAddGuest(false);
              setEditingGuestId(null);
            }
          }}
        >
          <form className="grid gap-3" onSubmit={submitGuest}>
            <label className="grid gap-1.5 text-xs font-semibold text-white/80">
              Guest full name *
              <input
                className={INPUT}
                required
                minLength={2}
                maxLength={160}
                autoComplete="name"
                value={guestForm.fullName}
                onChange={(event) => setGuestForm({ ...guestForm, fullName: event.target.value })}
                placeholder="Guest name"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-white/80">
              Email address *
              <input
                className={INPUT}
                required
                type="email"
                maxLength={180}
                autoComplete="email"
                value={guestForm.email}
                onChange={(event) => setGuestForm({ ...guestForm, email: event.target.value })}
                placeholder="guest@example.com"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-semibold text-white/80">
                Phone
                <input
                  className={INPUT}
                  type="tel"
                  maxLength={40}
                  autoComplete="tel"
                  value={guestForm.phone}
                  onChange={(event) => setGuestForm({ ...guestForm, phone: event.target.value })}
                  placeholder="+265 …"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-white/80">
                Country
                <input
                  className={INPUT}
                  maxLength={80}
                  autoComplete="country-name"
                  value={guestForm.country}
                  onChange={(event) => setGuestForm({ ...guestForm, country: event.target.value })}
                  placeholder="Malawi"
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-xs font-semibold text-white/80">
              Notes
              <textarea
                className={INPUT}
                rows={3}
                maxLength={2000}
                value={guestForm.notes}
                onChange={(event) => setGuestForm({ ...guestForm, notes: event.target.value })}
                placeholder="Optional guest notes"
              />
            </label>
            <p className="text-[11px] leading-relaxed text-white/55">
              Adding a guest does not create a booking. Any later booking can be matched to this profile by email or phone.
            </p>
            <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
              <button
                className={BTN}
                type="button"
                disabled={busy}
                onClick={() => {
                  setShowAddGuest(false);
                  setEditingGuestId(null);
                }}
              >
                Cancel
              </button>
              <button className={BTN_PRIMARY} type="submit" disabled={busy || !guestForm.fullName.trim() || !guestForm.email.trim()}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                {editingGuestId ? "Save and resend email" : "Add guest and send email"}
              </button>
            </div>
          </form>
        </DeskDialog>
      )}
    </div>
  );
}
