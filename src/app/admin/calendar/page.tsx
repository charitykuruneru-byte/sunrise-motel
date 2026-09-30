"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, Loader2, RefreshCw, Shield, Trash2 } from "lucide-react";

/**
 * ROOM CALENDAR — 30 nights, one row per physical room.
 *
 * Four colours, each one a fact rather than a decoration:
 *   green  free for that night
 *   blue   a stay is assigned to that room (bookings.assigned_room_id)
 *   red    blocked — a dated hold, which is also the row that takes the room off sale
 *   yellow the room needs attention today (its `state`)
 *
 * Bookings that have not been assigned to a physical room appear in their own strip
 * rather than being painted onto a row nobody chose for them.
 */

type GridRoom = { id: string; roomNumber: string; floor: string | null; state: string; roomTypeId: string; roomType: string; isActive: boolean };
type Stay = { id: string; reference: string; guestName: string; assignedRoomId: string | null; checkIn: string; checkOut: string; status: string };
type Block = { id: string; roomNumber: string; startDate: string; endDate: string; reason: string; note: string | null };
type Unassigned = { roomType: string; checkIn: string; checkOut: string };

const REASONS = ["maintenance", "hold", "ooo", "other"];

export default function CalendarPage() {
  const [days, setDays] = useState<string[]>([]);
  const [rooms, setRooms] = useState<GridRoom[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [unassigned, setUnassigned] = useState<Unassigned[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [today, setToday] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ roomNumber: "", startDate: "", endDate: "", reason: "maintenance", note: "" });

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/calendar", { cache: "no-store" });
    const data = (await response.json()) as {
      days?: string[];
      rooms?: GridRoom[];
      stays?: Stay[];
      unassigned?: Unassigned[];
      blocks?: Block[];
      today?: string;
      error?: string;
    };
    if (!response.ok) throw new Error(data.error ?? "Could not load the calendar.");
    setDays(data.days ?? []);
    setRooms(data.rooms ?? []);
    setStays(data.stays ?? []);
    setUnassigned(data.unassigned ?? []);
    setBlocks(data.blocks ?? []);
    setToday(data.today ?? "");
  }, []);

  useEffect(() => {
    void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load the calendar."));
  }, [load]);

  const block = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/room-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as { block?: Block; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not block that room.");
      setNotice(`Room ${data.block?.roomNumber} held from ${data.block?.startDate} to ${data.block?.endDate}. Those nights are off sale.`);
      setForm({ ...form, note: "" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not block that room.");
    } finally {
      setBusy(false);
    }
  };

  const release = async (row: Block) => {
    if (!window.confirm(`Release room ${row.roomNumber} for ${row.startDate} → ${row.endDate}?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/room-blocks?id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not release those dates.");
      setNotice(`Room ${row.roomNumber} is sellable again for those nights.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not release those dates.");
    } finally {
      setBusy(false);
    }
  };

  const stayFor = (roomId: string, night: string) =>
    stays.find((stay) => stay.assignedRoomId === roomId && stay.checkIn <= night && stay.checkOut > night);
  const blockFor = (roomNumber: string, night: string) =>
    blocks.find((row) => row.roomNumber === roomNumber && row.startDate <= night && row.endDate > night);

  const cellTone = (room: GridRoom, night: string) => {
    const hit = blockFor(room.roomNumber, night);
    if (hit) return { background: "#f6c9c9", title: `Blocked: ${hit.reason.replace(/_/g, " ")}` };
    const stay = stayFor(room.id, night);
    if (stay) return { background: "#c9dcf6", title: `${stay.guestName} (${stay.reference})` };
    if (night === today && (room.state === "dirty" || room.state === "out_of_order")) {
      return { background: room.state === "out_of_order" ? "#f6c9c9" : "#f7e6b8", title: `Today: ${room.state.replace(/_/g, " ")}` };
    }
    return { background: "#d7efd9", title: "Free" };
  };

  return (
    <div className="sunrise-app-root">
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 16px 96px" }}>
        <span className="eyebrow"><span className="eyebrow-line" /> ROOMS</span>
        <h1 className="hero-headline" style={{ marginTop: 8 }}>Thirty nights, every room.</h1>
        <p className="hero-description">
          Click any night to start a block from that date. A block is not a drawing: those nights stop being
          sellable on the website, because availability subtracts blocked rooms exactly as it subtracts live bookings.
        </p>

        <form onSubmit={block} className="form-fields-group" style={{ marginTop: 20 }}>
          <div className="form-grid-2">
            <label className="form-input-label"><span>Room</span>
              <select value={form.roomNumber} onChange={(e) => setForm({ ...form, roomNumber: e.target.value })} required>
                <option value="">Choose a room…</option>
                {rooms.map((room) => <option key={room.id} value={room.roomNumber}>{room.roomNumber} — {room.roomType}</option>)}
              </select>
            </label>
            <label className="form-input-label"><span>Reason</span>
              <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                {REASONS.map((reason) => <option key={reason} value={reason}>{reason.replace(/_/g, " ")}</option>)}
              </select>
            </label>
          </div>
          <div className="form-grid-2">
            <label className="form-input-label"><span>First night blocked</span><input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
            <label className="form-input-label"><span>Sellable again from</span><input type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
          </div>
          <label className="form-input-label"><span>Note</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. plumber booked for the 3rd" /></label>
          <button type="submit" className="admin-btn admin-btn-primary" disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />} Block those nights
          </button>
        </form>

        {error ? <div className="booking-error-banner" style={{ marginTop: 16 }}><Shield size={14} /><span>{error}</span></div> : null}
        {notice ? <div className="booking-error-banner" style={{ marginTop: 16, borderColor: "var(--sage)" }}><span>{notice}</span></div> : null}

        <div className="section-toolbar" style={{ marginTop: 24 }}>
          <div className="toolbar-info"><h2>Room × night</h2><p>Green free · blue a stay is in that room · red blocked · yellow needs attention today.</p></div>
          <button className="admin-btn" type="button" disabled={busy} onClick={() => void load()}><RefreshCw size={14} /> Refresh</button>
        </div>
        <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 16 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, background: "var(--paper, #fff)", textAlign: "left", padding: "8px 10px" }}>Room</th>
                {days.map((day) => (
                  <th key={day} style={{ padding: "6px 4px", fontWeight: day === today ? 800 : 500, whiteSpace: "nowrap" }}>
                    {day.slice(8)}<br /><small>{day.slice(5, 7)}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.id}>
                  <td style={{ position: "sticky", left: 0, background: "var(--paper, #fff)", padding: "6px 10px", whiteSpace: "nowrap" }}>
                    <strong>{room.roomNumber}</strong><br /><small>{room.roomType}</small>
                  </td>
                  {days.map((day) => {
                    const tone = cellTone(room, day);
                    return (
                      <td
                        key={day}
                        title={`${room.roomNumber} · ${day} · ${tone.title}`}
                        onClick={() => setForm({ ...form, roomNumber: room.roomNumber, startDate: day, endDate: day })}
                        style={{ background: tone.background, border: "1px solid rgba(0,0,0,0.06)", cursor: "pointer", minWidth: 26, height: 30 }}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>


        {unassigned.length > 0 ? (
          <p className="toolbar-info" style={{ marginTop: 12, fontSize: 13 }}>
            <strong>{unassigned.length} booking(s) with no room chosen yet</strong> — the desk assigns a room at check-in, so these sit in no row:{" "}
            {unassigned.map((row) => `${row.roomType} ${row.checkIn}→${row.checkOut}`).join(" · ")}
          </p>
        ) : null}

        <div className="section-toolbar" style={{ marginTop: 28 }}>
          <div className="toolbar-info"><h2>Blocks holding rooms back</h2><p>Nothing here means every room is on sale for every night.</p></div>
        </div>
        <div className="invoice-list">
          {blocks.map((row) => (
            <div className="invoice-row" key={row.id}>
              <div><strong>Room {row.roomNumber}</strong><small>{row.startDate} → {row.endDate} · {row.reason.replace(/_/g, " ")}{row.note ? ` · ${row.note}` : ""}</small></div>
              <div>
                <button className="btn-action btn-danger-text" type="button" disabled={busy} onClick={() => void release(row)}><Trash2 size={14} /> Release</button>
              </div>
            </div>
          ))}
          {blocks.length === 0 ? <p className="empty-state">No blocks — every room is sellable.</p> : null}
        </div>
      </main>
    </div>
  );
}

