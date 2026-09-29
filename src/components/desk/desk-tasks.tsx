"use client";

import { Loader2, Wrench } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

  const act = (task: Task, action: string, extra: Record<string, unknown> = {}, label = "Task updated.") =>
    run(label, () =>
      api("/api/desk/tasks", { method: "PATCH", body: JSON.stringify({ taskId: task.id, action, ...extra }) }),
    );

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <Wrench size={16} className="text-[#f8c66b]" /> Housekeeping &amp; maintenance
        </h2>
        <span className="text-[11px] text-white/50">
          {stats.open} open · {stats.overdue} overdue · {stats.urgent} urgent · {stats.doneToday} done today
        </span>
      </section>
      {!readOnly && (
        <section className={CARD}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/60">Log a task</h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={`${INPUT} max-w-[130px]`}
              placeholder="room (e.g. 104)"
              value={form.roomNumber}
              onChange={(e) => setForm({ ...form, roomNumber: e.target.value })}
            />
            <select
              className={`${INPUT} max-w-[160px]`}
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind.replace("_", " ")}
                </option>
              ))}
            </select>
            <select
              className={`${INPUT} max-w-[150px]`}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="normal">normal (2 h)</option>
              <option value="urgent">urgent (15 min)</option>
              <option value="emergency">emergency (5 min)</option>
            </select>
            <input
              className={`${INPUT} max-w-[180px]`}
              placeholder="assign to (name)"
              value={form.assignedTo}
              onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
            />
            <input
              className={`${INPUT} max-w-[260px]`}
              placeholder="note (e.g. extra pillows)"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
            <button
              className={BTN_PRIMARY}
              disabled={busy || !form.roomNumber.trim()}
              onClick={() =>
                run("Task logged.", async () => {
                  await api("/api/desk/tasks", { method: "POST", body: JSON.stringify(form) });
                  setForm({ roomNumber: "", kind: "cleaning", note: "", priority: "normal", assignedTo: "" });
                })
              }
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : null} Add task
            </button>
          </div>
        </section>
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
                      Start
                    </button>
                    <button
                      className={BTN_PRIMARY}
                      disabled={busy}
                      onClick={() => act(task, "done", {}, "Task completed — the room is clean and sellable again.")}
                    >
                      Done
                    </button>
                    <button className={BTN} disabled={busy} onClick={() => act(task, "cancel", {}, "Task cancelled.")}>
                      Cancel
                    </button>
                    <button className={BTN_DANGER} disabled={busy} onClick={() => setOooFor(task.id)}>
                      Send room out of order
                    </button>
                  </div>
                )}
              </div>
              {oooFor === task.id && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    className={`${INPUT} max-w-[320px]`}
                    placeholder="why can't it be fixed now?"
                    value={oooReason}
                    onChange={(e) => setOooReason(e.target.value)}
                  />
                  <button
                    className={BTN_DANGER}
                    disabled={busy}
                    onClick={async () => {
                      await act(
                        task,
                        "out_of_order",
                        { reason: oooReason },
                        "Room set out of order — it will not be sold until fixed.",
                      );
                      setOooFor(null);
                      setOooReason("");
                    }}
                  >
                    Confirm out of order
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

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
