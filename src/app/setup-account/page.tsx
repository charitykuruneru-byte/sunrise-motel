"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

type InviteInfo = {
  valid: boolean;
  reason?: string;
  email?: string;
  name?: string;
  role?: string;
  accountType?: "staff" | "guest";
};

export default function SetupAccountPage() {
  const [token, setToken] = useState("");
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [requestEmail, setRequestEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const inviteToken = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(inviteToken);
    if (!inviteToken) {
      setInfo({ valid: false, reason: "This invitation link is missing its token." });
      setLoading(false);
      return;
    }
    fetch(`/api/invitations/setup?token=${encodeURIComponent(inviteToken)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as InviteInfo;
        setInfo(data);
        if (data.name) setName(data.name);
        if (data.email) setRequestEmail(data.email);
      })
      .catch(() => setInfo({ valid: false, reason: "We could not verify this link. Contact the Administrator." }))
      .finally(() => setLoading(false));
  }, []);

  const score = [password.length >= 8, /[A-Z]/.test(password), /[0-9]/.test(password), /[a-z]/.test(password)].filter(Boolean).length;
  const strength = ["", "Weak", "Fair", "Good", "Strong"][score];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/invitations/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password, confirmPassword, acceptedTerms }),
      });
      const data = (await response.json()) as { error?: string; success?: boolean; emailSent?: boolean; loginUrl?: string; redirectTo?: string | null };
      if (!response.ok) throw new Error(data.error ?? "Could not create the account.");
      setMessage(data.redirectTo ? "Account created — signing you in…" : data.emailSent ? "Account created. A confirmation email has been sent." : "Account created. The confirmation email could not be delivered; you can sign in now.");
      // Staff are already signed in (the server set the session cookie on this very
      // response), so they go straight to the portal; guests go to their sign-in page.
      const destination = data.redirectTo || data.loginUrl;
      if (destination) window.setTimeout(() => window.location.assign(destination), 1800);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  };

  const requestInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/invitations/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: requestEmail }),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not send the request.");
      setMessage(data.message ?? "Your request has been sent to the Administrator.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--ivory)] px-4 py-10">
      <section className="mx-auto max-w-lg rounded-xl border border-[var(--line)] bg-white p-6 shadow-sm">
        <p className="text-[11px] font-black tracking-widest text-[var(--orange-deep)]">SUNRISE MOTEL</p>
        <h1 className="mt-2 text-2xl font-bold">Set up your account</h1>
        {loading ? <p className="mt-5 flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 size={16} className="animate-spin" /> Checking your invitation…</p> : null}
        {!loading && info?.valid ? (
          <>
            <p className="mt-2 text-sm text-[var(--muted)]">Invitation for {info.role?.replaceAll("_", " ")}</p>
            {message ? <p className="mt-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-900" role="status">{message}</p> : (
              <form onSubmit={submit} className="mt-5 space-y-4">
                <label className="block text-sm font-semibold">Email
                  <input className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--ivory)] px-3 py-2 font-normal" type="email" value={info.email ?? ""} readOnly />
                </label>
                <label className="block text-sm font-semibold">Full name
                  <input className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 font-normal" autoComplete="name" minLength={2} maxLength={160} required value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label className="block text-sm font-semibold">Create password
                  <input className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 font-normal" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
                </label>
                {password ? <p className="text-xs text-[var(--muted)]" role="status">Password strength: {strength}. Use at least 8 characters, one uppercase letter and one number.</p> : null}
                <label className="block text-sm font-semibold">Confirm password
                  <input className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 font-normal" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                </label>
                <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /><span>I agree to the Sunrise Motel account terms.</span></label>
                {error ? <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700" role="alert">{error}</p> : null}
                <button className="admin-btn admin-btn-primary flex w-full justify-center" type="submit" disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Create My Account</button>
              </form>
            )}
          </>
        ) : null}
        {!loading && !info?.valid ? (
          <>
            <h2 className="mt-3 text-lg font-bold">Invitation unavailable</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{info?.reason ?? "Link expired. Contact Admin to resend invite."}</p>
            {message ? <p className="mt-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-900" role="status">{message}</p> : (
              <form onSubmit={requestInvite} className="mt-4 space-y-3">
                <label className="block text-sm font-semibold">Email on the invitation
                  <input className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 font-normal" type="email" autoComplete="email" required value={requestEmail} onChange={(event) => setRequestEmail(event.target.value)} />
                </label>
                {error ? <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700" role="alert">{error}</p> : null}
                <button className="admin-btn admin-btn-primary w-full justify-center" type="submit" disabled={busy}>{busy ? "Sending…" : "Request New Invite"}</button>
              </form>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}