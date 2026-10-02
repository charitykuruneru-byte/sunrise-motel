"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
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
    <div className="sunrise-app-root audit-log-page">
      <style jsx global>{`
        .audit-log-page main.audit-log-main { width: 100%; max-width: 1320px; margin: 0 auto; padding: 8px 0 64px; }
        .audit-log-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
        .audit-log-hero-copy { max-width: 780px; }
        .audit-log-hero h1 { margin: 10px 0 8px; color: var(--ink); font: 600 clamp(34px, 4vw, 50px)/1.04 var(--serif); letter-spacing: -0.035em; }
        .audit-log-hero p { max-width: 720px; color: var(--muted); font-size: 14px; line-height: 1.7; }
        .audit-log-readonly { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 8px; padding: 10px 14px; border: 1px solid rgba(82,106,87,.2); border-radius: 999px; background: var(--sage-light); color: var(--sage); font-size: 12px; font-weight: 700; }
        .audit-log-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 24px 0 18px; }
        .audit-log-stat { min-width: 0; border: 1px solid rgba(23,21,19,.09); border-radius: 18px; padding: 18px; background: rgba(255,255,255,.82); box-shadow: 0 8px 30px rgba(23,21,19,.035); }
        .audit-log-stat-icon { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 12px; background: var(--orange-light); color: var(--orange-deep); }
        .audit-log-stat-label { margin-top: 14px; color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .11em; }
        .audit-log-stat-value { margin-top: 4px; color: var(--ink); font-size: 27px; font-weight: 750; line-height: 1.15; }
        .audit-log-stat-detail { margin-top: 5px; color: var(--muted); font-size: 12px; line-height: 1.45; }
        .audit-log-families { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 16px; }
        .audit-log-families .btn-action { min-height: 36px; padding: 0 13px; border: 1px solid rgba(23,21,19,.1); border-radius: 999px; background: rgba(255,255,255,.72); color: var(--muted); font-size: 12px; transition: border-color .18s, background .18s, color .18s; }
        .audit-log-families .btn-action.is-active { border-color: var(--orange); background: var(--orange-light); color: var(--orange-deep); font-weight: 700; opacity: 1 !important; }
        .audit-log-filter-panel { margin-top: 0; padding: 20px; border: 1px solid rgba(23,21,19,.09); border-radius: 18px; background: rgba(255,255,255,.78); box-shadow: 0 8px 30px rgba(23,21,19,.035); }
        .audit-log-filter-title { margin-bottom: 14px; color: var(--ink); font-size: 14px; font-weight: 700; }
        .audit-log-filter-fields { gap: 14px; }
        .audit-log-filter-actions { gap: 8px; }
        .audit-log-filter-note { margin-top: 14px; color: var(--muted); font-size: 12px; line-height: 1.5; }
        .audit-log-day { margin-top: 24px; }
        .audit-log-day-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 2px 10px; border-bottom: 1px solid var(--line); color: var(--ink); }
        .audit-log-day-heading small { color: var(--muted); }
        .audit-log-events { display: grid; gap: 10px; margin-top: 12px; }
        .audit-log-event { display: grid; grid-template-columns: minmax(230px, 1.1fr) minmax(180px, .7fr) auto; align-items: center; gap: 16px; padding: 17px; border: 1px solid rgba(23,21,19,.09); border-left: 3px solid var(--event-tone); border-radius: 15px; background: rgba(255,255,255,.86); box-shadow: 0 6px 20px rgba(23,21,19,.025); }
        .audit-log-event-main, .audit-log-event-meta { display: grid; min-width: 0; gap: 5px; }
        .audit-log-event-title { display: flex; align-items: center; gap: 9px; color: var(--ink); font-size: 13px; }
        .audit-log-event-main small, .audit-log-event-meta small { overflow-wrap: anywhere; color: var(--muted); font-size: 11px; line-height: 1.45; }
        .audit-log-event-meta strong { color: var(--ink); font-size: 13px; }
        .audit-log-event-actions { justify-content: flex-end; }
        .audit-log-details { grid-column: 1 / -1; min-width: 0; }
        .audit-log-details pre { overflow-x: auto; border: 1px solid rgba(23,21,19,.08); background: #fbf9f6 !important; color: var(--ink); }
        @media (max-width: 1100px) {
          .audit-log-page main.audit-log-main { padding-top: 20px; }
          .audit-log-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .audit-log-event { grid-template-columns: minmax(0, 1fr) minmax(150px, .6fr); }
          .audit-log-event-actions { grid-column: 1 / -1; justify-content: flex-start; }
        }
        @media (max-width: 640px) {
          .audit-log-page main.audit-log-main { padding: 18px 14px 48px; }
          .audit-log-hero { align-items: flex-start; flex-direction: column; gap: 14px; }
          .audit-log-stats { gap: 9px; }
          .audit-log-stat { padding: 13px; border-radius: 15px; }
          .audit-log-stat-value { font-size: 23px; }
          .audit-log-filter-panel { padding: 14px; }
          .audit-log-event { grid-template-columns: minmax(0, 1fr); gap: 10px; padding: 14px; }
          .audit-log-event-actions, .audit-log-details { grid-column: auto; }
        }
      `}</style>
      <main className="audit-log-main">
        <section className="audit-log-hero">
          <div className="audit-log-hero-copy">
            <span className="eyebrow"><span className="eyebrow-line" /> ACCOUNTABILITY</span>
            <h1>Every action, in order.</h1>
            <p>
              A protected, read-only record of changes across the property. Each event keeps its original details
              so actions can be traced back to the account and evidence behind them.
            </p>
          </div>
          <span className="audit-log-readonly"><Shield size={15} /> Read-only · append-only</span>
        </section>

        <div className="audit-log-stats">
          <div className="audit-log-stat">
            <span className="audit-log-stat-icon"><History size={17} /></span>
            <div className="audit-log-stat-label">EVENTS IN VIEW</div>
            <div className="audit-log-stat-value">{stats.total.toLocaleString()}</div>
            <div className="audit-log-stat-detail">{entries.length} on screen{stats.total > entries.length ? " · newest first" : ""}</div>
          </div>
          <div className="audit-log-stat">
            <span className="audit-log-stat-icon"><UserRound size={17} /></span>
            <div className="audit-log-stat-label">PEOPLE ACTING</div>
            <div className="audit-log-stat-value">{stats.people.toLocaleString()}</div>
            <div className="audit-log-stat-detail">Distinct accounts behind these events</div>
          </div>
          <div className="audit-log-stat">
            <span className="audit-log-stat-icon"><Download size={17} /></span>
            <div className="audit-log-stat-label">MONEY EVENTS</div>
            <div className="audit-log-stat-value">{stats.money.toLocaleString()}</div>
            <div className="audit-log-stat-detail">Payments, invoices, expenses and audits</div>
          </div>
          <div className="audit-log-stat">
            <span className="audit-log-stat-icon" style={{ color: stats.failures > 0 ? TONE.bad : undefined, background: stats.failures > 0 ? "#fcebea" : undefined }}><AlertTriangle size={17} /></span>
            <div className="audit-log-stat-label">REFUSED OR FAILED</div>
            <div className="audit-log-stat-value" style={{ color: stats.failures > 0 ? TONE.bad : undefined }}>{stats.failures.toLocaleString()}</div>
            <div className="audit-log-stat-detail">Failed sends, rejected payments and revoked invitations</div>
          </div>
        </div>

        <div className="audit-log-families">
          <button className={`btn-action${family === "all" ? " is-active" : ""}`} type="button" aria-pressed={family === "all"} style={{ opacity: family === "all" ? 1 : 0.55 }} onClick={() => setFamily("all")}>
            All · {stats.total}
          </button>
          {stats.families.map((row) => (
            <button
              key={row.family}
              className={`btn-action${family === row.family ? " is-active" : ""}`}
              type="button"
              aria-pressed={family === row.family}
              style={{ opacity: family === row.family ? 1 : 0.55 }}
              onClick={() => setFamily(family === row.family ? "all" : row.family)}
            >
              {row.family} · {row.count}
            </button>
          ))}
        </div>


        <form
          className="form-fields-group audit-log-filter-panel"
          onSubmit={(event) => {
            event.preventDefault();
            setLoading(true);
            void load().finally(() => setLoading(false));
          }}
        >
          <div className="audit-log-filter-title">Find an event</div>
          <div className="form-grid-2 audit-log-filter-fields">
            <label className="form-input-label"><span>Search the summary, reference or email</span>
              <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="e.g. SM-260930-S2AH" />
            </label>
            <label className="form-input-label"><span>Only one action type</span>
              <input value={action} onChange={(event) => setAction(event.target.value)} placeholder="e.g. INVITE_SENT" />
            </label>
          </div>
          <div className="form-grid-2 audit-log-filter-fields">
            <label className="form-input-label"><span>Actor (name or email)</span>
              <input value={actor} onChange={(event) => setActor(event.target.value)} placeholder="e.g. willardkulemeka8" />
            </label>
            <div className="form-grid-2">
              <label className="form-input-label"><span>From</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
              <label className="form-input-label"><span>Until</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
            </div>
          </div>
          <div className="invoice-actions audit-log-filter-actions" style={{ flexWrap: "wrap" }}>
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
          <p className="audit-log-filter-note">
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
          <section key={day} className="audit-log-day">
            <div className="audit-log-day-heading">
              <strong>{new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</strong>
              <small style={{ opacity: 0.6 }}>{rows.length} event{rows.length === 1 ? "" : "s"}</small>
            </div>
            <div className="audit-log-events">
              {rows.map((entry) => {
                const tone = toneOf(entry.action);
                const guestId = guestIdOf(entry);
                const expanded = open === entry.id;
                return (
                  <article key={entry.id} className="audit-log-event" style={{ "--event-tone": TONE[tone] } as CSSProperties}>
                    <div className="audit-log-event-main">
                      <strong className="audit-log-event-title">
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
                    <div className="audit-log-event-meta">
                      <strong>{new Date(entry.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</strong>
                      <small>
                        {entry.entity}
                        {entry.reference ? ` · ${entry.reference}` : ""}
                        {entry.targetEmail ? ` · ${entry.targetEmail}` : ""}
                      </small>
                    </div>
                    <div className="invoice-actions audit-log-event-actions" style={{ flexWrap: "wrap" }}>
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
                      <div className="audit-log-details">
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
