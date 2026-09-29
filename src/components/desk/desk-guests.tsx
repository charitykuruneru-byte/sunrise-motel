"use client";

import { Loader2, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import GuestCredentialsPanel, { type GuestCredentials } from "./guest-credentials-card";
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
  const [emailFor, setEmailFor] = useState<Record<string, string>>({});
  const [deskPassword, setDeskPassword] = useState<Record<string, string>>({});
  /** The password the SYSTEM chose, held in memory only until the card is printed. */
  const [credentials, setCredentials] = useState<GuestCredentials | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ guests: GuestRow[]; stats: typeof stats }>("/api/desk/guests");
    setGuests(data.guests);
    setStats(data.stats);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (label: string, work: () => Promise<unknown>) => {
    if (readOnly) return;
    setBusy(true);
    try {
      await work();
      await load();
      await onChanged();
      setToast(label);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "That action failed.");
    } finally {
      setBusy(false);
    }
  };

  const invite = (guest: GuestRow) =>
    run("Guest account created — activation email sent (or the code is shown to read out).", async () => {
      if (!guest.activeStay) throw new Error("This guest has no active stay to link the account to.");
      const data = await api<{
        result: {
          existingAccount: boolean;
          emailSent: boolean;
          emailReason: string | null;
          activationLink: string | null;
          activationOtp: string | null;
        };
      }>("/api/desk/guests", {
        method: "POST",
        body: JSON.stringify({
          action: "invite",
          bookingId: guest.activeStay.id,
          login: emailFor[guest.id] || undefined,
        }),
      });
      if (data.result.existingAccount) {
        setToast("Returning guest — their stay is now linked to the existing account; no new password issued.");
      } else if (!data.result.emailSent) {
        setToast(
          `Saved but not emailed (${data.result.emailReason ?? "SMTP unavailable"}). Read out code ${data.result.activationOtp ?? "—"} or share ${data.result.activationLink ?? "—"}`,
        );
      }
    });

  /**
   * THE FRONT DESK IS THE DOORWAY. The desk types the email, the SYSTEM picks the
   * password, and it comes back exactly once for the card that is handed over. A
   * returning guest keeps the password they already know — the stay is just linked,
   * and the panel says so instead of inventing a new one for a regular.
   */
  const register = (guest: GuestRow) =>
    run("Account registered — hand over the sign-in card.", async () => {
      if (!guest.activeStay) throw new Error("This guest has no active stay to link the account to.");
      const email = (emailFor[guest.id] ?? guest.email ?? "").trim();
      if (!email) throw new Error("Type the email address the guest will sign in with.");
      const data = await api<{
        result: {
          loginEmail: string;
          password: string | null;
          existingAccount: boolean;
          roomNumber: string | null;
          checkOut: string | null;
          emailSent: boolean;
          emailReason: string | null;
        };
      }>("/api/desk/guests", {
        method: "POST",
        body: JSON.stringify({ action: "register", bookingId: guest.activeStay.id, login: email }),
      });
      setCredentials({
        guestName: guest.fullName,
        loginEmail: data.result.loginEmail,
        password: data.result.password,
        roomNumber: data.result.roomNumber,
        checkOut: data.result.checkOut,
        guestPhone: guest.phone,
        emailSent: data.result.emailSent,
        emailReason: data.result.emailReason,
      });
    });

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
  return (
    <div className="space-y-4">
      {credentials && (
        <section>
          <GuestCredentialsPanel credentials={credentials} />
          <button className={`${BTN} mt-2`} type="button" onClick={() => setCredentials(null)}>
            Done — the guest has the details
          </button>
        </section>
      )}
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
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!readOnly && guest.activeStay && !guest.accounts.some((a) => a.status === "active") && (
                  <>
                    <input
                      className={`${INPUT} max-w-[210px]`}
                      placeholder="email the guest signs in with"
                      value={emailFor[guest.id] ?? ""}
                      onChange={(e) => setEmailFor({ ...emailFor, [guest.id]: e.target.value })}
                    />
                    <button className={BTN_PRIMARY} disabled={busy} onClick={() => register(guest)}>
                      {busy ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} Register + show
                      password
                    </button>
                    <button className={BTN} disabled={busy} onClick={() => invite(guest)}>
                      Email a link instead
                    </button>
                  </>
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
                          className={BTN}
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
    </div>
  );
}
