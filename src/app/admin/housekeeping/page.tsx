"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Shield, Wrench } from "lucide-react";
import { AdminPageFrame } from "@/components/admin/admin-navigation";

/**
 * HOUSEKEEPING BOARD — every room in the column that matches its real state.
 *
 * The board owns no data of its own: it draws `rooms.state` and the open `service_tasks`
 * rows, and every move writes back through the same APIs the desk uses. That is why a
 * room marked clean here is clean on the desk's screen too, and the cleaning task that
 * put it in the Dirty column is closed at the same moment.
 *
 * Every move is a button (with a keyboard focus ring), so it works on the phone in a
 * housekeeper's hand — drag-and-drop is deliberately not the only way to do anything.
 */

type Room = { id: string; roomNumber: string; roomType: string; floor: string | null; state: string; oooReason: string | null; notes: string | null };
type Task = { id: string; roomNumber: string; kind: string; note: string | null; status: string; priority: string; assignedTo: string | null; requestedByLabel: string | null; createdAt: string };

const COLUMNS = [
  { key: "dirty", title: "Dirty", hint: "Vacated, waiting" },
  { key: "cleaning", title: "Cleaning", hint: "Somebody is in it" },
  { key: "clean", title: "Clean", hint: "Ready to sell" },
  { key: "inspecting", title: "Inspecting", hint: "Checked and passed" },
  { key: "maintenance", title: "Maintenance", hint: "Out of order" },
] as const;

export default function HousekeepingPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/housekeeping", { cache: "no-store" });
    const data = (await response.json()) as { rooms?: Room[]; tasks?: Task[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not load the board.");
    setRooms(data.rooms ?? []);
    setTasks(data.tasks ?? []);
  }, []);

  useEffect(() => {
    void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load the board."));
  }, [load]);

  const call = async (method: "POST" | "PATCH", payload: Record<string, unknown>, message: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/housekeeping", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "That did not work.");
      setNotice(message);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  const tasksFor = (roomNumber: string) => tasks.filter((task) => task.roomNumber === roomNumber);
  const inProgress = (roomNumber: string) => tasksFor(roomNumber).some((task) => task.status === "in_progress" || task.status === "assigned");
  const maintenanceTask = (roomNumber: string) => tasksFor(roomNumber).some((task) => task.kind === "maintenance");

  /** Which column a room belongs in — derived from state + its open tasks. */
  const columnOf = (room: Room): string | null => {
    if (room.state === "out_of_order") return "maintenance";
    if (room.state === "inspected") return "inspecting";
    if (room.state === "clean" || room.state === "available") return "clean";
    if (room.state === "dirty") return inProgress(room.roomNumber) ? "cleaning" : "dirty";
    if (room.state === "occupied") {
      // An occupied room only belongs on this board if somebody asked for something.
      if (maintenanceTask(room.roomNumber)) return "maintenance";
      return tasksFor(room.roomNumber).length > 0 ? "cleaning" : null;
    }
    return null;
  };

  return (
    <AdminPageFrame>
    <div className="sunrise-app-root">
      <main className="manager-tool-page" style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 16px 96px" }}>
        <span className="eyebrow"><span className="eyebrow-line" /> HOUSEKEEPING</span>
        <h1 className="hero-headline" style={{ marginTop: 8 }}>Who is cleaning what, right now.</h1>
        <p className="hero-description">
          A room sits in the column that matches its real state. Move it and the desk sees the same thing —
          there is no second copy of the truth to keep in step.
        </p>

        {error ? <div className="booking-error-banner" style={{ marginTop: 16 }}><Shield size={14} /><span>{error}</span></div> : null}
        {notice ? <div className="booking-error-banner" style={{ marginTop: 16, borderColor: "var(--sage)" }}><span>{notice}</span></div> : null}

        <div className="section-toolbar" style={{ marginTop: 20 }}>
          <div className="toolbar-info"><h2>Board</h2><p>{rooms.length} rooms · {tasks.length} open task(s)</p></div>
          <button className="admin-btn" type="button" disabled={busy} onClick={() => void load()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
          {COLUMNS.map((column) => {
            const columnRooms = rooms.filter((room) => columnOf(room) === column.key);
            return (
              <section key={column.key} className="manager-board-column" style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 12, background: "rgba(255,255,255,0.6)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong>{column.title}</strong>
                  <small>{columnRooms.length}</small>
                </div>
                <small style={{ opacity: 0.7 }}>{column.hint}</small>
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {columnRooms.map((room) => (
                    <article key={room.id} className="manager-board-room" style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 10, background: "#fff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <strong>{room.roomNumber}</strong>
                        <small>{room.roomType}</small>
                      </div>
                      {room.oooReason && room.state === "out_of_order" ? <small style={{ opacity: 0.75 }}>{room.oooReason}</small> : null}
                      {tasksFor(room.roomNumber).map((task) => (
                        <div key={task.id} style={{ fontSize: 12, marginTop: 6 }}>
                          <span style={{ opacity: 0.75 }}>{task.kind.replace(/_/g, " ")}{task.priority !== "normal" ? ` · ${task.priority}` : ""}{task.assignedTo ? ` · ${task.assignedTo}` : ""}</span>
                          {task.note ? <small style={{ display: "block", opacity: 0.65 }}>{task.note}</small> : null}
                          <button className="btn-action" type="button" disabled={busy} onClick={() => void call("PATCH", { taskId: task.id, status: "done" }, `Task for ${room.roomNumber} closed.`)}>
                            <CheckCircle2 size={13} /> Done
                          </button>
                        </div>
                      ))}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {column.key === "dirty" ? (
                          <button className="btn-action" type="button" disabled={busy} onClick={() => void call("POST", { roomNumber: room.roomNumber, kind: "cleaning" }, `${room.roomNumber}: cleaning started.`)}>Start cleaning</button>
                        ) : null}
                        {column.key === "cleaning" ? (
                          <button className="btn-action" type="button" disabled={busy} onClick={() => void call("PATCH", { roomId: room.id, state: "clean" }, `${room.roomNumber} marked clean.`)}>Mark clean</button>
                        ) : null}
                        {column.key === "clean" ? (
                          <button className="btn-action" type="button" disabled={busy} onClick={() => void call("PATCH", { roomId: room.id, state: "inspected" }, `${room.roomNumber} inspected.`)}>Inspected</button>
                        ) : null}
                        {column.key === "maintenance" ? (
                          <button className="btn-action" type="button" disabled={busy} onClick={() => void call("PATCH", { roomId: room.id, state: "dirty" }, `${room.roomNumber} repaired — needs cleaning.`)}>Repaired</button>
                        ) : null}
                        {column.key !== "maintenance" ? (
                          <button className="btn-action" type="button" disabled={busy} onClick={() => {
                            const reason = window.prompt(`Why is room ${room.roomNumber} out of order?`, "Plumbing");
                            if (reason === null) return;
                            void call("PATCH", { roomId: room.id, state: "out_of_order", reason }, `${room.roomNumber} out of order.`);
                          }}><Wrench size={13} /> Out of order</button>
                        ) : null}
                        {column.key === "inspecting" ? (
                          <button className="btn-action" type="button" disabled={busy} onClick={() => void call("PATCH", { roomId: room.id, state: "available" }, `${room.roomNumber} is ready to sell.`)}>Ready to sell</button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                  {columnRooms.length === 0 ? <small style={{ opacity: 0.55 }}>Nothing here.</small> : null}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
    </AdminPageFrame>
  );
}

