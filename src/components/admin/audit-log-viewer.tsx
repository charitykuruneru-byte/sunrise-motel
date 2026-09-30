"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, History, Loader2, RefreshCw } from "lucide-react";

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

export default function AuditLogViewer() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [target, setTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const query = useCallback(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (actor.trim()) params.set("actor", actor.trim());
    if (action.trim()) params.set("action", action.trim());
    if (target.trim()) params.set("target", target.trim());
    return params;
  }, [from, to, actor, action, target]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/audit-logs?${query().toString()}`, { cache: "no-store" });
      const data = (await response.json()) as { entries?: Entry[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not load audit records.");
      setEntries(data.entries ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load audit records.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);
  const exportUrl = (format: string) => `/api/admin/audit-logs?${query().toString()}&format=${format}`;

  return (
    <main className="admin-page">
      <header className="admin-page-header">
        <div><p className="eyebrow"><span className="eyebrow-line" /> ACCOUNTABILITY</p><h1>Audit log</h1><p>Every account and operational action with its actor, target and timestamp.</p></div>
        <a className="admin-btn" href="/admin"><History size={15} /> Admin dashboard</a>
      </header>
      <section className="admin-content-section">
        <form className="admin-modal-form admin-inline-form" onSubmit={(event) => { event.preventDefault(); void load(); }}>
          <div className="form-grid-2">
            <label><span>From</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label><span>To</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
            <label><span>Actor email</span><input type="search" value={actor} onChange={(event) => setActor(event.target.value)} placeholder="Search actor" /></label>
            <label><span>Action type</span><input type="search" value={action} onChange={(event) => setAction(event.target.value)} placeholder="e.g. INVITE_SENT" /></label>
            <label><span>Target</span><input type="search" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Email, ID or booking reference" /></label>
          </div>
          <div className="inline-actions"><button className="admin-btn admin-btn-primary" type="submit" disabled={loading}>{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Apply filters</button><a className="admin-btn" href={exportUrl("csv")}><Download size={14} /> CSV</a><a className="admin-btn" href={exportUrl("pdf")}><Download size={14} /> PDF</a></div>
        </form>
      </section>
      {error ? <p className="admin-alert admin-alert-error" role="alert">{error}</p> : null}
      <section className="admin-content-section">
        <p className="text-sm text-[var(--muted)]">{entries.length} record(s), up to 1,000 shown.</p>
        <div className="invoice-list">
          {entries.map((entry) => (
            <article className="invoice-row" key={entry.id}>
              <div><strong>{entry.actorLabel ?? entry.actorEmail ?? entry.actor}</strong><small>{entry.actorEmail ?? "Actor email not recorded"} · {entry.actorRole ?? "role not recorded"}</small><small>{new Date(entry.createdAt).toLocaleString()}</small></div>
              <div><strong>{entry.action}</strong><small>{entry.entity}{entry.reference ? ` · ${entry.reference}` : ""}</small>{entry.summary ? <small>{entry.summary}</small> : null}</div>
              <div><strong>{entry.targetEmail ?? entry.targetId ?? entry.entityId ?? "—"}</strong><small>{entry.ip ?? "IP unavailable"}</small>{entry.details || entry.metadataJson ? <small>{JSON.stringify(entry.details ?? entry.metadataJson)}</small> : null}</div>
            </article>
          ))}
          {!entries.length && !loading ? <p className="empty-state">No records match these filters.</p> : null}
        </div>
      </section>
    </main>
  );
}