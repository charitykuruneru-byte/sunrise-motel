"use client";

import { AlertTriangle, Check, Loader2, Play, Plus, X, Wrench } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import DeskDialog from "./desk-dialog";
import { api, BTN, BTN_DANGER, BTN_PRIMARY, CARD, INPUT, ROOM_STATE_LABEL } from "./shared";

type Task = {
  id: string;
  roomNumber: string;
  kind: string;
  note: string | null;
  requestedBy: string;
  requestedByLabel: string | null;
  assignedTo: string | null;
  priority: string;
  status: string;
  dueBy: string | null;
  completedAt: string | null;
  completedBy: string | null;
  overdue: boolean;
  roomState: string | null;
};

const KINDS = ["cleaning", "towels", "linen", "maintenance", "amenity", "taxi", "wake_up", "other"];

export default function DeskTasks({
  setToast,
  onChanged,
  readOnly,
}: {
  setToast: (message: string) => void;
  onChanged: () => Promise<void>;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState<Task[]>([]);
  const [done, setDone] = useState<Task[]>([]);
  const [stats, setStats] = useState({ open: 0, overdue: 0, urgent: 0, doneToday: 0 });
  const [busy, setBusy] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [form, setForm] = useState({ roomNumber: "", kind: "cleaning", note: "", priority: "normal", assignedTo: "" });
  const [oooFor, setOooFor] = useState<string | null>(null);
  const [oooReason, setOooReason] = useState("");

  const load = useCallback(async () => {
    const data = await api<{
      open: Task[];
      done: Task[];
      stats: { open: number; overdue: number; urgent: number; doneToday: number };
    }>("/api/desk/tasks");
    setOpen(data.open);
    setDone(data.done);
    setStats(data.stats);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (label: string, work: () => Promise<unknown>) => {
    if (readOnly) return false;
    setBusy(true);
    try {
      await work();
      await load();
      await onChanged();
      setToast(label);
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "That action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const act = (task: Task, action: string, extra: Record<string, unknown> = {}, label = "Task updated.") =>
    run(label, () =>
      api("/api/desk/tasks", { method: "PATCH", body: JSON.stringify({ taskId: task.id, action, ...extra }) }),
    );

  const submitTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await run("Task logged.", async () => {
      await api("/api/desk/tasks", { method: "POST", body: JSON.stringify(form) });
      setForm({ roomNumber: "", kind: "cleaning", note: "", priority: "normal", assignedTo: "" });
    });
    if (saved) setShowAddTask(false);
  };

  const submitOutOfOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const task = open.find((item) => item.id === oooFor);
    if (!task) return;
    const saved = await act(
      task,
      "out_of_order",
      { reason: oooReason },
      "Room set out of order — it will not be sold until fixed.",
    );
    if (saved) {
      setOooFor(null);
      setOooReason("");
    }
  };

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Wrench size={16} className="text-[#f8c66b]" /> Housekeeping &amp; maintenance
        </h2>
        <span className="text-[11px] text-white/50">
          {stats.open} open · {stats.overdue} overdue · {stats.urgent} urgent · {stats.doneToday} done today
        </span>
        {!readOnly && (
          <button className={`${BTN_PRIMARY} ml-auto min-h-10`} type="button" onClick={() => setShowAddTask(true)}>
            <Plus size={14} /> Log a task
          </button>
        )}
      </section>
      {showAddTask && !readOnly && (
        <DeskDialog
          title="Log a housekeeping task"
          description="Choose the room, task and urgency. Add a note or assignee if helpful."
          onClose={() => { if (!busy) setShowAddTask(false); }}
        >
          <form className="grid gap-4" onSubmit={submitTask}>
            <label className="grid gap-1.5 text-xs font-semibold text-white/80">
              Room number *
              <input
                className={INPUT}
                autoFocus
                required
                maxLength={16}
                value={form.roomNumber}
                onChange={(event) => setForm({ ...form, roomNumber: event.target.value })}
                placeholder="e.g. 104"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-semibold text-white/80">
                Task *
                <select className={INPUT} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
                  {KINDS.map((kind) => <option key={kind} value={kind}>{kind.replace("_", " ")}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-white/80">
                Priority *
                <select className={INPUT} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                  <option value="normal">Normal · due in 2 hours</option>
                  <option value="urgent">Urgent · due in 15 minutes</option>
                  <option value="emergency">Emergency · due in 5 minutes</option>
                </select>
              </label>
            </div>
            <label className="grid gap-1.5 text-xs font-semibold text-white/80">
              Assign to (optional)
              <input className={INPUT} maxLength={120} value={form.assignedTo} onChange={(event) => setForm({ ...form, assignedTo: event.target.value })} placeholder="Staff member name" />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-white/80">
              Note (optional)
              <textarea className={INPUT} rows={3} maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="For example, bring extra pillows" />
            </label>
            <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
              <button className={BTN} type="button" disabled={busy} onClick={() => setShowAddTask(false)}>Cancel</button>
              <button className={BTN_PRIMARY} type="submit" disabled={busy || !form.roomNumber.trim()}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add task
              </button>
            </div>
          </form>
        </DeskDialog>
      )}
      <section className={CARD}>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/60">Open tasks</h3>
        <div className="space-y-2">
          {open.length === 0 && (
            <p className="text-[11px] text-white/40">Nothing outstanding — every room is clean.</p>
          )}
          {open.map((task) => (
            <div
              key={task.id}
              className={`rounded border p-2.5 text-xs ${
                task.overdue ? "border-rose-500/50 bg-rose-500/10" : "border-white/10 bg-black/20"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">
                    Room {task.roomNumber} · {task.kind.replace("_", " ")}{" "}
                    {task.priority !== "normal" ? <span className="text-rose-200">({task.priority})</span> : null}
                  </p>
                  <p className="text-[11px] text-white/55">
                    {task.note ?? "—"} · by {task.requestedByLabel ?? task.requestedBy}
                    {task.assignedTo ? ` · assigned to ${task.assignedTo}` : ""}
                    {task.roomState ? ` · room ${ROOM_STATE_LABEL[task.roomState] ?? task.roomState}` : ""}
                  </p>
                  <p className="text-[11px] text-white/45">
                    due{" "}
                    {task.dueBy
                      ? new Date(task.dueBy).toLocaleString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "short",
                        })
                      : "—"}
                    {task.overdue ? " · OVERDUE" : ""}
                  </p>
                </div>
                {!readOnly && (
                  <div className="flex flex-wrap gap-1.5">
                    <button className={BTN} disabled={busy} onClick={() => act(task, "start")}>
                      <Play size={14} /> Start work
                    </button>
                    <button
                      className={BTN_PRIMARY}
                      disabled={busy}
                      onClick={() => act(task, "done", {}, "Task completed — the room is clean and sellable again.")}
                    >
                      <Check size={15} /> Mark done
                    </button>
                    <button className={BTN} disabled={busy} onClick={() => act(task, "cancel", {}, "Task cancelled.")}>
                      <X size={14} /> Cancel task
                    </button>
                    <button className={BTN_DANGER} disabled={busy} onClick={() => setOooFor(task.id)}>
                      <AlertTriangle size={14} /> Mark room unavailable
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {oooFor && !readOnly && (
        <DeskDialog
          title="Mark room out of order"
          description="The room will be removed from sale until it is restored. Record the reason for the desk and housekeeping team."
          onClose={() => { if (!busy) { setOooFor(null); setOooReason(""); } }}
        >
          <form className="grid gap-4" onSubmit={submitOutOfOrder}>
            <label className="grid gap-1.5 text-xs font-semibold text-white/80">
              Reason *
              <textarea
                className={INPUT}
                autoFocus
                required
                minLength={3}
                maxLength={500}
                rows={3}
                value={oooReason}
                onChange={(event) => setOooReason(event.target.value)}
                placeholder="Describe what needs to be repaired or checked"
              />
            </label>
            <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
              <button className={BTN} type="button" disabled={busy} onClick={() => { setOooFor(null); setOooReason(""); }}>Cancel</button>
              <button className={BTN_DANGER} type="submit" disabled={busy || oooReason.trim().length < 3}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : null} Confirm out of order
              </button>
            </div>
          </form>
        </DeskDialog>
      )}

      <section className={CARD}>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/60">Recently completed</h3>
        <div className="space-y-1">
          {done.length === 0 && <p className="text-[11px] text-white/40">Nothing completed yet.</p>}
          {done.slice(0, 15).map((task) => (
            <p key={task.id} className="border-b border-white/5 py-1 text-[11px] text-white/55">
              Room {task.roomNumber} · {task.kind.replace("_", " ")} · {task.status} by {task.completedBy ?? "—"}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
