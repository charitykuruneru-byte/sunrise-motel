"use client";

import { CheckCircle2, Key, Loader2 } from "lucide-react";
import { useEffect, useState, useCallback } from "react";

type TokenInfo = {
  valid: boolean;
  reason?: string;
  guestName?: string;
  purpose?: string;
  loginEmail?: string | null;
  loginEmailMasked?: string | null;
  loginPhone?: string | null;
  /** Where the 6-digit code goes. `sms` means the desk reads it out (no inbox on file). */
  otpChannel?: "email" | "sms";
  otpRules?: { digits: number; minutes: number; attempts: number; resendSeconds: number };
  codeSentAt?: string | null;
  codeExpiresAt?: string | null;
  codeVerified?: boolean;
  codeBlockedUntil?: string | null;
  alreadyActive?: boolean;
  status?: string;
};

/**
 * Activation page (step 5 of the §2 lifecycle): the guest opens the single-use
 * link, sets a password and proves the inbox (or the phone, when there is no inbox)
 * with a 6-digit code.
 *
 * The code is the ONLY thing standing between an email and an account, so this page
 * is deliberate about it: it never shows the code itself, it says where it went, it
 * counts down how long it lives, and it lets the guest ask for a new one no more
 * than once a minute. A guest who never gets it can still walk to the counter —
 * everything in the app can be done there.
 */
export default function ActivatePage() {
  const [token, setToken] = useState("");
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Seconds left before another code may be requested, and before the current one dies. */
  const [resendIn, setResendIn] = useState(0);

  const loadInfo = useCallback(async (value: string) => {
    try {
      const response = await fetch(`/api/guest/activate?token=${encodeURIComponent(value)}`);
      const data = (await response.json()) as TokenInfo;
      setInfo(data);
      // Coming back to a page whose code is already in flight: honour the wait that is
      // left rather than inviting a second request the server will only throttle.
      const since = data.codeSentAt ? Date.now() - new Date(data.codeSentAt).getTime() : Number.POSITIVE_INFINITY;
      const wait = (data.otpRules?.resendSeconds ?? 60) * 1000 - since;
      setResendIn(wait > 0 ? Math.ceil(wait / 1000) : 0);
    } catch {
      setInfo({ valid: false, reason: "We could not check that link. Ask the front desk to resend it." });
    }
  }, []);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(value);
    if (!value) {
      setInfo({
        valid: false,
        reason: "This page needs the link from your email (it looks like /activate?token=…).",
      });
      setLoading(false);
      return;
    }
    void loadInfo(value).finally(() => setLoading(false));
  }, [loadInfo]);

  // One clock drives both the "ask again in 47s" button and the "code dies in 9:12" line.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const secondsLeftOnCode = (() => {
    if (!info?.codeExpiresAt) return null;
    const left = Math.round((new Date(info.codeExpiresAt).getTime() - Date.now()) / 1000);
    return left > 0 ? left : 0;
  })();

  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  /** Ask for a fresh code. The old one dies the moment a new one is generated. */
  const resend = async () => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const response = await fetch("/api/guest/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "send_code" }),
      });
      const data = (await response.json()) as {
        error?: string;
        channel?: "email" | "sms";
        sentToMasked?: string | null;
        canResendInSeconds?: number;
        deskDelivery?: boolean;
        expiresInMinutes?: number;
      };
      if (!response.ok) throw new Error(data.error ?? "We could not send a new code.");
      setResendIn(data.canResendInSeconds ?? 60);
      setNotice(
        data.deskDelivery
          ? `There is no email address on your booking, so the front desk will read the new code out to you — call or walk up to the counter and say you are activating the app.`
          : `A new code is on its way to ${data.sentToMasked}. It replaces the old one and lasts ${data.expiresInMinutes ?? 10} minutes.`,
      );
      await loadInfo(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not send a new code.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    if (!/^[0-9]{6}$/.test(code.trim())) {
      setError(`Enter the ${info?.otpRules?.digits ?? 6}-digit code we sent you.`);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/guest/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          action: "complete",
          password,
          confirmPassword: confirm,
          phone,
          code: code.trim(),
        }),
      });
      const data = (await response.json()) as { error?: string; blockedUntil?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not activate your account.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not activate your account.");
      // A wrong code may have burned the attempt budget — re-read the state so the
      // page can say "this link is locked for 15 minutes" instead of guessing.
      await loadInfo(token);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--ivory)] px-4 py-10">
      <div className="mx-auto max-w-lg rounded-xl border border-[var(--line)] bg-white p-6 shadow-sm">
        <p className="text-[11px] font-black tracking-widest text-[var(--orange-deep)]">SUNRISE MOTEL</p>
        {loading && (
          <p className="mt-4 flex items-center gap-2 text-sm text-[var(--muted)]">
            <Loader2 className="animate-spin" size={16} /> Checking your link…
          </p>
        )}
        {!loading && info && !info.valid && (
          <>
            <h1 className="mt-2 text-xl font-bold">This link cannot be used</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">{info.reason}</p>
            <p className="mt-4 rounded border border-[var(--line)] bg-[var(--ivory)] p-3 text-sm">
              You never need the app to stay with us — the front desk can take your order, your message and your
              payment at the counter, and you can still track your booking with your reference and phone number.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a className="admin-btn admin-btn-primary" href="/track">
                Track my booking
              </a>
              <a className="admin-btn" href="/app">
                Try signing in
              </a>
            </div>
          </>
        )}

        {!loading && info?.valid && !done && (
          <>
            <h1 className="mt-2 text-xl font-bold">Welcome, {info.guestName}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {info.alreadyActive
                ? "Your account already exists — set a new password here and keep everything you had: your stays, your orders and your messages."
                : "Set a password for the Sunrise guest app. You will then be able to see your room number, follow your room bill, order food to your room and message the front desk."}
            </p>
            {info.codeBlockedUntil && new Date(info.codeBlockedUntil).getTime() > Date.now() && (
              <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                Too many tries on this link. It unlocks at{" "}
                {new Date(info.codeBlockedUntil).toLocaleTimeString()} — or the front desk can issue a fresh link
                immediately.
              </p>
            )}
            <form onSubmit={submit} className="mt-4 space-y-3">
              <label className="block text-sm font-semibold">
                Password
                <input
                  className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 font-normal"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="at least 8 characters"
                />
              </label>
              <label className="block text-sm font-semibold">
                Confirm password
                <input
                  className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 font-normal"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              <label className="block text-sm font-semibold">
                Phone number used at booking
                <input
                  className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 font-normal"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={info.loginPhone ?? "+265 …"}
                />
              </label>
              <label className="block text-sm font-semibold">
                {info.otpRules?.digits ?? 6}-digit code
                <input
                  className="mt-1 w-full rounded border border-[var(--line)] px-3 py-2 font-normal tracking-[0.3em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, info.otpRules?.digits ?? 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="······"
                />
                <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
                  {info.otpChannel === "sms"
                    ? "There is no email address on your booking, so the front desk reads this code out to you — it works the same."
                    : `Sent to ${info.loginEmailMasked ?? "the email address on your booking"}. Check spam if it has not arrived in a minute.`}
                </span>
              </label>

              <div className="rounded border border-[var(--line)] bg-[var(--ivory)] p-3 text-xs">
                <p className="font-semibold text-[var(--ink)]">
                  {secondsLeftOnCode === null
                    ? "No code has been sent yet"
                    : secondsLeftOnCode > 0
                      ? `This code is valid for another ${clock(secondsLeftOnCode)}`
                      : "That code has expired — ask for a new one"}
                </p>
                <p className="mt-1 text-[var(--muted)]">
                  {info.otpRules?.attempts ?? 3} attempts. After that the link locks for a while, and then the front desk
                  issues a fresh one in one tap.
                </p>
                <button
                  type="button"
                  className="admin-btn mt-2"
                  onClick={resend}
                  disabled={busy || resendIn > 0}
                >
                  {resendIn > 0 ? `Send a new code in ${resendIn}s` : "Send a new code"}
                </button>
              </div>

              {notice && (
                <p className="rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-800">{notice}</p>
              )}
              {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
              <button className="admin-btn admin-btn-primary w-full justify-center" type="submit" disabled={busy}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />} Set my password
              </button>
            </form>
            <p className="mt-3 text-xs text-[var(--muted)]">
              Prefer not to? Everything in the app is also available at the front desk and on WhatsApp. Your room, your
              bill and your meals do not depend on this.
            </p>
          </>
        )}

        {done && (
          <div className="mt-3">
            <p className="flex items-center gap-2 text-lg font-bold text-emerald-700">
              <CheckCircle2 size={20} /> Your account is active
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Sign in with your email (or phone number) and the password you just set, then add the app to your home
              screen for one-tap ordering.
            </p>
            <a className="admin-btn admin-btn-primary mt-4 inline-flex" href="/app">
              Open the guest app
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
