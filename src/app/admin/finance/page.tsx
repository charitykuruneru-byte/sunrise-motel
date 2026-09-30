"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, Calendar, CreditCard, Loader2, Percent, Plus, RefreshCw, Shield, Trash2, TrendingUp, Wallet } from "lucide-react";

/**
 * FINANCE — the night audit, and the expenses that make "net profit" mean something.
 *
 * Two rules this page follows, because they are the two ways a finance screen usually
 * lies:
 *   * the four figures on top are TODAY's, computed live from real rows; the stored
 *     audit is kept separately — nothing here is a snapshot pretending to be now;
 *   * an expense needs a date and a description, or the audit's net-profit line would
 *     be arithmetic on a guess.
 */

type Figures = {
  auditDate: string;
  roomsSold: number;
  roomsAvailable: number;
  occupancyBp: number;
  adr: number;
  revpar: number;
  roomRevenue: number;
  posRevenue: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
};

type AuditRow = Figures & { id: string; runBy: string | null; note: string | null; createdAt: string; updatedAt: string };

type Expense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  paidTo: string | null;
  method: string;
  spentOn: string;
  approvedBy: string | null;
  createdBy: string | null;
};

const money = (value: number) => `MWK ${Math.round(value || 0).toLocaleString("en-US")}`;
const percent = (bp: number) => `${(bp / 100).toFixed(2)}%`;

const CATEGORIES = ["cleaning", "food", "bar_stock", "maintenance", "salary", "utility", "other"];
const METHODS = ["cash", "bank", "m_pesa", "airtel_money", "card", "other"];

export default function FinancePage() {
  const [live, setLive] = useState<Figures | null>(null);
  const [history, setHistory] = useState<AuditRow[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    category: "food",
    description: "",
    amount: "",
    paidTo: "",
    method: "cash",
    spentOn: new Date().toISOString().slice(0, 10),
  });

  const load = useCallback(async () => {
    const [auditRes, expenseRes] = await Promise.all([
      fetch("/api/admin/night-audit", { cache: "no-store" }),
      fetch("/api/admin/expenses", { cache: "no-store" }),
    ]);
    const audit = (await auditRes.json()) as { live?: Figures; history?: AuditRow[]; error?: string };
    const spend = (await expenseRes.json()) as { expenses?: Expense[]; total?: number; error?: string };
    if (!auditRes.ok) throw new Error(audit.error ?? "Could not load the night audit.");
    if (!expenseRes.ok) throw new Error(spend.error ?? "Could not load expenses.");
    setLive(audit.live ?? null);
    setHistory(audit.history ?? []);
    setExpenses(spend.expenses ?? []);
    setExpenseTotal(spend.total ?? 0);
  }, []);

  useEffect(() => {
    void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load finance data."));
  }, [load]);

  const runAudit = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/night-audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = (await res.json()) as { audit?: AuditRow; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not run the night audit.");
      setNotice(
        `Night audit for ${data.audit?.auditDate} saved: ${data.audit?.roomsSold} rooms sold, occupancy ${percent(data.audit?.occupancyBp ?? 0)}, ADR ${money(data.audit?.adr ?? 0)}, RevPAR ${money(data.audit?.revpar ?? 0)}, net ${money(data.audit?.netProfit ?? 0)}.`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not run the night audit.");
    } finally {
      setBusy(false);
    }
  };

  const addExpense = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      const data = (await res.json()) as { expense?: Expense; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not record that expense.");
      setNotice(`Expense recorded: ${data.expense?.description} — ${money(data.expense?.amount ?? 0)}.`);
      setForm({ ...form, description: "", amount: "", paidTo: "" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record that expense.");
    } finally {
      setBusy(false);
    }
  };

  const removeExpense = async (expense: Expense) => {
    if (!window.confirm(`Delete "${expense.description}" (${money(expense.amount)})?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/expenses?id=${encodeURIComponent(expense.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete that expense.");
      setNotice("Expense deleted.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete that expense.");
    } finally {
      setBusy(false);
    }
  };

  const cards = [
    { label: "Occupancy today", value: live ? percent(live.occupancyBp) : "—", detail: live ? `${live.roomsSold} of ${live.roomsAvailable} rooms sold` : "", icon: Percent },
    { label: "ADR", value: live ? money(live.adr) : "—", detail: "Average daily rate — room revenue ÷ rooms sold", icon: TrendingUp },
    { label: "RevPAR", value: live ? money(live.revpar) : "—", detail: "Revenue per available room", icon: Banknote },
    { label: "Net today", value: live ? money(live.netProfit) : "—", detail: live ? `${money(live.totalRevenue)} in − ${money(live.totalExpenses)} out` : "", icon: Wallet },
  ];


  return (
    <div className="sunrise-app-root">
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 16px 96px" }}>
        <span className="eyebrow"><span className="eyebrow-line" /> FINANCE</span>
        <h1 className="hero-headline" style={{ marginTop: 8 }}>The day&apos;s numbers, and the day closed.</h1>
        <p className="hero-description">
          The figures below are today, calculated live from bookings, orders and expenses. Running the
          night audit stores them against that date — so a month later the record still says what it said
          that night, even if a payment is edited afterwards.
        </p>

        <div className="form-grid-2" style={{ marginTop: 20 }}>
          {cards.map((card) => (
            <div key={card.label} style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 16, background: "rgba(255,255,255,0.6)" }}>
              <card.icon size={16} />
              <div style={{ fontSize: 12, letterSpacing: 1, opacity: 0.7, marginTop: 8 }}>{card.label.toUpperCase()}</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{card.value}</div>
              {card.detail ? <div style={{ fontSize: 12, opacity: 0.7 }}>{card.detail}</div> : null}
            </div>
          ))}
        </div>

        {error ? <div className="booking-error-banner" style={{ marginTop: 16 }}><Shield size={14} /><span>{error}</span></div> : null}
        {notice ? <div className="booking-error-banner" style={{ marginTop: 16, borderColor: "var(--sage)" }}><span>{notice}</span></div> : null}

        <div className="section-toolbar" style={{ marginTop: 24 }}>
          <div className="toolbar-info">
            <h2>Night audit</h2>
            <p>Close today, or re-run any date — the stored row is replaced, never duplicated.</p>
          </div>
          <button className="admin-btn admin-btn-primary" type="button" disabled={busy} onClick={() => void runAudit()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />} Run night audit
          </button>
        </div>
        <div className="invoice-list">
          {history.map((row) => (
            <div className="invoice-row" key={row.id}>
              <div><strong>{row.auditDate}</strong><small>{row.runBy ? `closed by ${row.runBy}` : "closed"} · {row.roomsSold}/{row.roomsAvailable} rooms · occupancy {percent(row.occupancyBp)}</small></div>
              <div><strong>{money(row.totalRevenue)}</strong><small>rooms {money(row.roomRevenue)} · POS {money(row.posRevenue)} · expenses {money(row.totalExpenses)}</small></div>
              <div><strong>{money(row.netProfit)}</strong><small>ADR {money(row.adr)} · RevPAR {money(row.revpar)}</small></div>
            </div>
          ))}
          {history.length === 0 ? <p className="empty-state">No night has been closed yet. Press <em>Run night audit</em> to store today.</p> : null}
        </div>


        <div className="section-toolbar" style={{ marginTop: 28 }}>
          <div className="toolbar-info">
            <h2>Expenses</h2>
            <p>Total on record: {money(expenseTotal)}. The audit subtracts these — otherwise net profit is just revenue.</p>
          </div>
          <button className="admin-btn" type="button" disabled={busy} onClick={() => void load()}><RefreshCw size={14} /> Refresh</button>
        </div>
        <form onSubmit={addExpense} className="form-fields-group">
          <div className="form-grid-2">
            <label className="form-input-label"><span>Category</span>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((category) => <option key={category} value={category}>{category.replace(/_/g, " ")}</option>)}
              </select>
            </label>
            <label className="form-input-label"><span>Amount (MWK) *</span><input type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          </div>
          <label className="form-input-label"><span>What was it for? *</span><input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Laundry detergent — 5 boxes" /></label>
          <div className="form-grid-2">
            <label className="form-input-label"><span>Paid to</span><input value={form.paidTo} onChange={(e) => setForm({ ...form, paidTo: e.target.value })} placeholder="e.g. Lilongwe Supplies" /></label>
            <label className="form-input-label"><span>Method</span>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                {METHODS.map((method) => <option key={method} value={method}>{method.replace(/_/g, " ")}</option>)}
              </select>
            </label>
          </div>
          <label className="form-input-label"><span>Date spent *</span><input type="date" required value={form.spentOn} onChange={(e) => setForm({ ...form, spentOn: e.target.value })} /></label>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={busy}><Plus size={14} /> Record expense</button>
        </form>
        <div className="invoice-list">
          {expenses.map((expense) => (
            <div className="invoice-row" key={expense.id}>
              <div><strong>{expense.description}</strong><small>{expense.spentOn} · {expense.category.replace(/_/g, " ")}{expense.paidTo ? ` · paid to ${expense.paidTo}` : ""}</small></div>
              <div><strong>{money(expense.amount)}</strong><small>{expense.method.replace(/_/g, " ")}{expense.approvedBy ? ` · approved by ${expense.approvedBy}` : ""}</small></div>
              <div className="invoice-actions">
                <button className="btn-action btn-danger-text" type="button" disabled={busy} onClick={() => void removeExpense(expense)}><Trash2 size={14} /> Delete</button>
              </div>
            </div>
          ))}
          {expenses.length === 0 ? <p className="empty-state">No expenses recorded yet.</p> : null}
        </div>

        <footer className="admin-foot"><CreditCard size={13} /> Night audit and expenses · managers and admins only · every action is in the audit trail</footer>
      </main>
    </div>
  );
}

