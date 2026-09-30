"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  UserRound,
} from "lucide-react";

/**
 * AUDIT LOG — the record of who did what, built for reading rather than scrolling.
 *
 * Three ideas decide the layout, because an audit trail is only useful if somebody can
 * answer a question with it in seconds:
 *   * the numbers on top are computed over the SAME filters as the list, so "19 failures"
 *     always refers to the rows currently on screen;
 *   * filters are one click from the row — an actor, an action or a reference becomes a
 *     filter without retyping anything;
 *   * every action keeps its raw details, expandable, because a summary is a convenience
 *     and the details are the evidence.
 *
 * Read-only by design: this page offers no way to change or delete anything, and the API
 * behind it has no write methods at all.
 */

type Entry = {
  id: string;
  createdAt: string;
  actorLabel: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  actor: string;
  action: string;
  entity: string;
  entityId: string | null;
  reference: string | null;
  targetId: string | null;
  targetEmail: string | null;
  ip: string | null;
  summary: string | null;
  details: Record<string, unknown> | null;
  metadataJson: string | null;
};

type Stats = { total: number; people: number; failures: number; money: number; families: { family: string; count: number }[] };

const EMPTY: Stats = { total: 0, people: 0, failures: 0, money: 0, families: [] };

/** "booking.room_assigned" → "Booking · Room assigned" — readable without a dictionary. */
function readable(action: string) {
  const [head, ...rest] = action.split(".");
  const tail = rest.join(" ").replace(/[_.]+/g, " ");
  const clean = (value: string) => value.replace(/\b\w/g, (letter) => letter.toUpperCase());
  return tail ? `${clean(head)} · ${clean(tail)}` : clean(head);
}

/** Which colour a row earns: failures and deletions are loud, routine writes are quiet. */
function toneOf(action: string): "good" | "warn" | "bad" | "quiet" {
  const value = action.toLowerCase();
  if (value.includes("fail") || value.includes("reject") || value.includes("revoke") || value.includes("denied") || value.includes("void") || value.includes("delete")) return "bad";
  if (value.includes("create") || value.includes("confirm") || value.includes("paid") || value.includes("done") || value.includes("accepted")) return "good";
  if (value.includes("update") || value.includes("change") || value.includes("assign") || value.includes("block") || value.includes("extend")) return "warn";
  return "quiet";
}

const TONE: Record<"good" | "warn" | "bad" | "quiet", string> = {
  good: "#1f7a4d",
  warn: "#b26a00",
  bad: "#b3261e",
  quiet: "#6b7280",
};

/** The guest id behind a row, when there is one — this is what makes "Guest 360" a link. */
function guestIdOf(entry: Entry) {
  const details = (entry.details ?? {}) as Record<string, unknown>;
  const candidate = details.guestId ?? details.guest_id ?? (entry.entity === "guest" ? entry.targetId ?? entry.entityId : null);
  return typeof candidate === "string" && candidate.length >= 8 ? candidate : null;
}

const initialsOf = (value: string | null) =>
  (value ?? "?")
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("") || "?";

export default function AuditLogViewer() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [q, setQ] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [family, setFamily] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("target", q.trim());
    if (actor.trim()) params.set("actor", actor.trim());
    if (action.trim()) params.set("action", action.trim());
    if (family !== "all") params.set("family", family);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params;
  }, [q, actor, action, family, from, to]);

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/audit-logs?${query.toString()}`, { cache: "no-store" });
    const data = (await response.json()) as { entries?: Entry[]; stats?: Stats; error?: string };
    if (!response.ok) {
      setError(data.error ?? "Could not load the audit trail.");
      return;
    }
    setError("");
    setEntries(data.entries ?? []);
    setStats(data.stats ?? EMPTY);
  }, [query]);

  // Run inside an async task so every state update happens after an await; a synchronous
  // setState in an effect body renders twice for nothing.
  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        await load();
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load the audit trail.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [load]);

  const quickRange = (days: number | null) => {
    if (days === null) {
      setFrom("");
      setTo("");
      return;
    }
    const end = new Date();
    const start = new Date(end.getTime() - days * 86_400_000);
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
  };

  const reset = () => {
    setQ("");
    setActor("");
    setAction("");
    setFamily("all");
    setFrom("");
    setTo("");
    setNotice("");
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied to the clipboard.");
    } catch {
      setNotice(value);
    }
  };

  // Rows arrive newest-first; grouping by the Malawi day keeps that order while giving the
  // eye something to hold on to.
  const days = useMemo(() => {
    const groups = new Map<string, Entry[]>();
    for (const entry of entries) {
      const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Blantyre", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(entry.createdAt));
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    return [...groups.entries()];
  }, [entries]);

  const exportHref = (format: "csv" | "pdf") => {
    const params = new URLSearchParams(query);
    params.set("format", format);
    return `/api/admin/audit-logs?${params.toString()}`;
  };

  const activeFilters = [q && `“${q}”`, actor && `actor ${actor}`, action && `action ${action}`, family !== "all" && family, from && `from ${from}`, to && `until ${to}`].filter(Boolean) as string[];


  return (
    <div className="sunrise-app-root">
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 16px 96px" }}>
        <span className="eyebrow"><span className="eyebrow-line" /> ACCOUNTABILITY</span>
        <h1 className="hero-headline" style={{ marginTop: 8 }}>Every action, in order.</h1>
        <p className="hero-description">
          Nothing here can be edited or deleted — by anyone, including a Super Admin. The details behind each row
          are kept exactly as they were written, so a summary can always be checked against its evidence.
        </p>

        <div className="form-grid-2" style={{ marginTop: 20 }}>
          <div style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 16, background: "rgba(255,255,255,0.6)" }}>
            <History size={16} />
            <div style={{ fontSize: 12, letterSpacing: 1, opacity: 0.7, marginTop: 8 }}>EVENTS IN VIEW</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.total.toLocaleString()}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{entries.length} on screen{stats.total > entries.length ? " (newest first)" : ""}</div>
          </div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 16, background: "rgba(255,255,255,0.6)" }}>
            <UserRound size={16} />
            <div style={{ fontSize: 12, letterSpacing: 1, opacity: 0.7, marginTop: 8 }}>PEOPLE ACTING</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.people.toLocaleString()}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>distinct accounts behind those events</div>
          </div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 16, background: "rgba(255,255,255,0.6)" }}>
            <Download size={16} />
            <div style={{ fontSize: 12, letterSpacing: 1, opacity: 0.7, marginTop: 8 }}>MONEY EVENTS</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.money.toLocaleString()}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>payments, invoices, expenses, night audits</div>
          </div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 16, background: "rgba(255,255,255,0.6)" }}>
            <AlertTriangle size={16} color={stats.failures > 0 ? TONE.bad : undefined} />
            <div style={{ fontSize: 12, letterSpacing: 1, opacity: 0.7, marginTop: 8 }}>REFUSED OR FAILED</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: stats.failures > 0 ? TONE.bad : undefined }}>{stats.failures.toLocaleString()}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>failed sends, rejected payments, revoked invitations</div>
          </div>
        </div>

        <div className="invoice-actions" style={{ marginTop: 16, flexWrap: "wrap" }}>
          <button className="btn-action" type="button" style={{ opacity: family === "all" ? 1 : 0.55 }} onClick={() => setFamily("all")}>
            All · {stats.total}
          </button>
          {stats.families.map((row) => (
            <button
              key={row.family}
              className="btn-action"
              type="button"
              style={{ opacity: family === row.family ? 1 : 0.55 }}
              onClick={() => setFamily(family === row.family ? "all" : row.family)}
            >
              {row.family} · {row.count}
            </button>
          ))}
        </div>


        <form
          className="form-fields-group"
          style={{ marginTop: 16 }}
          onSubmit={(event) => {
            event.preventDefault();
            setLoading(true);
            void load().finally(() => setLoading(false));
          }}
        >
          <div className="form-grid-2">
            <label className="form-input-label"><span>Search the summary, reference or email</span>
              <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="e.g. SM-260930-S2AH" />
            </label>
            <label className="form-input-label"><span>Only one action type</span>
              <input value={action} onChange={(event) => setAction(event.target.value)} placeholder="e.g. INVITE_SENT" />
            </label>
          </div>
          <div className="form-grid-2">
            <label className="form-input-label"><span>Actor (name or email)</span>
              <input value={actor} onChange={(event) => setActor(event.target.value)} placeholder="e.g. willardkulemeka8" />
            </label>
            <div className="form-grid-2">
              <label className="form-input-label"><span>From</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
              <label className="form-input-label"><span>Until</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
            </div>
          </div>
          <div className="invoice-actions" style={{ flexWrap: "wrap" }}>
            <button className="admin-btn admin-btn-primary" type="submit" disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Apply filters
            </button>
            <button className="btn-action" type="button" onClick={() => quickRange(0)}>Today</button>
            <button className="btn-action" type="button" onClick={() => quickRange(7)}>Last 7 days</button>
            <button className="btn-action" type="button" onClick={() => quickRange(30)}>Last 30 days</button>
            <button className="btn-action" type="button" onClick={() => quickRange(null)}>All time</button>
            <button className="btn-action" type="button" onClick={reset}><RefreshCw size={13} /> Reset</button>
            <a className="btn-action" href={exportHref("csv")}><Download size={13} /> CSV for Excel</a>
            <a className="btn-action" href={exportHref("pdf")}><FileText size={13} /> PDF</a>
          </div>
          <p style={{ fontSize: 12, opacity: 0.7 }}>
            {activeFilters.length > 0
              ? `Filtered by ${activeFilters.join(" · ")} — the cards above count only these rows.`
              : "Showing everything on record. Exports use whatever filters are set here."}
          </p>
        </form>

        {error ? <div className="booking-error-banner" style={{ marginTop: 16 }}><AlertTriangle size={14} /><span>{error}</span></div> : null}
        {notice ? <div className="booking-error-banner" style={{ marginTop: 12, borderColor: "var(--sage)" }}><span>{notice}</span></div> : null}


        {loading && entries.length === 0 ? (
          <p className="empty-state" style={{ marginTop: 24 }}><Loader2 size={14} className="animate-spin" /> Reading the trail…</p>
        ) : null}

        {days.map(([day, rows]) => (
          <section key={day} style={{ marginTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
              <strong>{new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</strong>
              <small style={{ opacity: 0.6 }}>{rows.length} event{rows.length === 1 ? "" : "s"}</small>
            </div>
            <div className="invoice-list">
              {rows.map((entry) => {
                const tone = toneOf(entry.action);
                const guestId = guestIdOf(entry);
                const expanded = open === entry.id;
                return (
                  <article key={entry.id} className="invoice-row" style={{ borderLeft: `3px solid ${TONE[tone]}`, alignItems: "start", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 260 }}>
                      <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: TONE[tone], display: "inline-block" }} />
                        {readable(entry.action)}
                      </strong>
                      <small>{entry.summary ?? `${entry.entity}${entry.reference ? ` · ${entry.reference}` : ""}`}</small>
                      <small style={{ opacity: 0.72 }}>
                        {initialsOf(entry.actorLabel ?? entry.actorEmail)} · {entry.actorLabel ?? entry.actor}
                        {entry.actorEmail ? ` · ${entry.actorEmail}` : ""}
                        {entry.actorRole ? ` · ${entry.actorRole}` : ""}
                        {entry.ip ? ` · ${entry.ip}` : ""}
                      </small>
                    </div>
                    <div>
                      <strong>{new Date(entry.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</strong>
                      <small>
                        {entry.entity}
                        {entry.reference ? ` · ${entry.reference}` : ""}
                        {entry.targetEmail ? ` · ${entry.targetEmail}` : ""}
                      </small>
                    </div>
                    <div className="invoice-actions" style={{ flexWrap: "wrap" }}>
                      <button className="btn-action" type="button" onClick={() => setOpen(expanded ? null : entry.id)}>
                        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Details
                      </button>
                      {entry.actorEmail ? (
                        <button className="btn-action" type="button" onClick={() => setActor(entry.actorEmail ?? "")} title="Show everything this person did">
                          Their other actions
                        </button>
                      ) : null}
                      <button className="btn-action" type="button" onClick={() => setAction(entry.action)} title="Show every row of this action type">
                        Only this action
                      </button>
                      {entry.reference ? (
                        <button className="btn-action" type="button" onClick={() => setQ(entry.reference ?? "")} title="Everything about this booking">
                          This reference
                        </button>
                      ) : null}
                      {guestId ? (
                        <a className="btn-action" href={`/admin/guests/${guestId}`}><ArrowUpRight size={13} /> Guest 360</a>
                      ) : null}
                      {entry.summary ? (
                        <button className="btn-action" type="button" onClick={() => void copy(`${entry.action} — ${entry.summary}`)}><Copy size={13} /> Copy</button>
                      ) : null}
                    </div>
                    {expanded ? (
                      <div style={{ flexBasis: "100%", marginTop: 8 }}>
                        <pre style={{ overflowX: "auto", fontSize: 12, background: "rgba(0,0,0,0.04)", padding: 12, borderRadius: 12, margin: 0 }}>
                          {JSON.stringify(entry.details ?? entry.metadataJson ?? {}, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ))}

        {!loading && entries.length === 0 ? (
          <p className="empty-state" style={{ marginTop: 24 }}>No records match these filters. <button className="btn-action" type="button" onClick={reset}>Clear them</button></p>
        ) : null}

        <footer className="admin-foot"><Shield size={13} /> Read-only · append-only · Super Admin only · {stats.total.toLocaleString()} events in view</footer>
      </main>
    </div>
  );
}

