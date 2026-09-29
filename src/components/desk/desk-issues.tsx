"use client";

import { AlertTriangle, Loader2, MessageSquare, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ageLabel, BTN, BTN_DANGER, BTN_PRIMARY, CARD, INPUT, money, THREAD_STATUS_LABEL } from "./shared";

type ThreadMessage = {
  id: string;
  direction: string;
  body: string;
  kind: string;
  status: string;
  senderLabel: string | null;
  createdAt: string;
  readByStaffAt: string | null;
  readByGuestAt: string | null;
};

type Thread = {
  id: string;
  roomNumber: string | null;
  guestName: string | null;
  subject: string | null;
  kind: string;
  priority: string;
  status: string;
  resolutionNote: string | null;
  ageMinutes: number;
  lastMessageAt: string;
  messages: ThreadMessage[];
  context: {
    stay: { reference: string; checkIn: string; checkOut: string; status: string; nights: number } | null;
    folioBalance: number;
    openOrders: number;
    previousStays: number;
    previousComplaints: number;
    firstTime: boolean;
    appAccount: string | null;
    marketingConsent: boolean;
  };
};

const CANNED = [
  "On our way with towels.",
  "We are checking this now and will come back to you shortly.",
  "Sorry about that — we will fix it today.",
  "Your order is being prepared.",
  "Your bill is settled. Thank you for staying with us.",
  "Maintenance has been called and will attend shortly.",
];

export default function DeskIssues({
  setToast,
  onChanged,
  readOnly,
}: {
  setToast: (message: string) => void;
  onChanged: () => Promise<void>;
  readOnly: boolean;
}) {
  const [rooms, setRooms] = useState<{ roomNumber: string; threads: Thread[]; emergency: boolean }[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [totals, setTotals] = useState({ open: 0, emergencies: 0, escalated: 0, unacknowledged: 0 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await api<{
      rooms: { roomNumber: string; threads: Thread[]; emergency: boolean }[];
      threads: Thread[];
      totals: { open: number; emergencies: number; escalated: number; unacknowledged: number };
    }>("/api/desk/issues");
    setRooms(data.rooms);
    setThreads(data.threads);
    setTotals(data.totals);
    setOpenId((current) => current ?? data.rooms[0]?.threads[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = threads.find((thread) => thread.id === openId) ?? null;

  const run = async (label: string, payload: Record<string, unknown>) => {
    if (readOnly) return;
    setBusy(true);
    try {
      await api("/api/desk/issues", { method: "POST", body: JSON.stringify(payload) });
      await load();
      await onChanged();
      setToast(label);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "That action failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <MessageSquare size={16} className="text-[#f8c66b]" /> Messages &amp; issues
        </h2>
        <span className="text-[11px] text-white/50">
          {totals.open} open · {totals.unacknowledged} not yet acknowledged · {totals.escalated} escalated
        </span>
        {totals.emergencies > 0 && (
          <span className="flex items-center gap-1 rounded border border-rose-500/50 bg-rose-500/15 px-2 py-1 text-[11px] font-bold text-rose-100">
            <AlertTriangle size={12} /> {totals.emergencies} EMERGENCY
          </span>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <div className={CARD}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/60">In-house rooms</h3>
          <div className="space-y-1.5">
            {rooms.length === 0 && <p className="text-[11px] text-white/40">No open issues.</p>}
            {rooms.map((room) => (
              <div key={room.roomNumber}>
                <p className={`text-[11px] font-bold ${room.emergency ? "text-rose-200" : "text-white/70"}`}>
                  {room.emergency ? "🔴 " : "⚠ "}
                  Room {room.roomNumber === "unassigned" ? "— (no room)" : room.roomNumber} · {room.threads.length} open
                </p>
                {room.threads.map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => setOpenId(thread.id)}
                    className={`mt-1 block w-full rounded border px-2 py-1.5 text-left text-[11px] ${
                      openId === thread.id ? "border-[#f28c18] bg-[#f28c18]/10" : "border-white/10 bg-black/20"
                    }`}
                  >
                    <span className="font-semibold">{thread.subject ?? thread.kind}</span>
                    <span className="block text-white/55">
                      {thread.guestName} · {ageLabel(thread.ageMinutes)} ago · {THREAD_STATUS_LABEL[thread.status] ?? thread.status}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className={CARD}>
          {!selected && <p className="text-[11px] text-white/40">Pick a room on the left to open its thread.</p>}
          {selected && (
            <>
              <header className="mb-3 border-b border-white/10 pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold">
                      {selected.roomNumber ? `Room ${selected.roomNumber}` : "No room"} · {selected.guestName}
                    </h3>
                    <p className="text-[11px] text-white/60">
                      {selected.subject ?? selected.kind} · {THREAD_STATUS_LABEL[selected.status] ?? selected.status} ·{" "}
                      {ageLabel(selected.ageMinutes)} old
                      {selected.priority !== "normal" ? ` · ${selected.priority.toUpperCase()}` : ""}
                    </p>
                  </div>
                  {!readOnly && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        className={BTN}
                        disabled={busy}
                        onClick={() => run("Thread acknowledged.", { threadId: selected.id, action: "acknowledge" })}
                      >
                        Acknowledge
                      </button>
                      <button
                        className={BTN}
                        disabled={busy}
                        onClick={() => run("Escalated to the admin.", { threadId: selected.id, action: "escalate" })}
                      >
                        Escalate
                      </button>
                      <button
                        className={BTN_DANGER}
                        disabled={busy}
                        onClick={() => run("Thread closed.", { threadId: selected.id, action: "close" })}
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-2 grid gap-1 text-[11px] text-white/60 sm:grid-cols-3">
                  <span>
                    Stay:{" "}
                    {selected.context.stay
                      ? `${selected.context.stay.checkIn} → ${selected.context.stay.checkOut}`
                      : "—"}
                  </span>
                  <span>Folio balance: {money(selected.context.folioBalance)}</span>
                  <span>Open orders: {selected.context.openOrders}</span>
                  <span>
                    {selected.context.firstTime ? "First-time guest" : `${selected.context.previousStays} previous stay(s)`}
                  </span>
                  <span>Previous complaints: {selected.context.previousComplaints}</span>
                  <span>App account: {selected.context.appAccount ?? "none"}</span>
                </div>
              </header>

              <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
                {selected.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded border p-2.5 text-xs ${
                      message.direction === "desk_to_guest"
                        ? "border-[#f28c18]/40 bg-[#f28c18]/10"
                        : "border-white/10 bg-black/20"
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-wide text-white/45">
                      {message.direction === "desk_to_guest"
                        ? `Desk · ${message.senderLabel ?? ""}`
                        : `${selected.guestName} · guest app`}{" "}
                      ·{" "}
                      {new Date(message.createdAt).toLocaleString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "short",
                      })}
                      {message.kind !== "message" ? ` · ${message.kind}` : ""}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-white/90">{message.body}</p>
                  </div>
                ))}
                {selected.messages.length === 0 && <p className="text-[11px] text-white/40">No messages yet.</p>}
              </div>
              {!readOnly && (
                <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                  <div className="flex flex-wrap gap-1.5">
                    {CANNED.map((text) => (
                      <button
                        key={text}
                        className={BTN}
                        disabled={busy}
                        onClick={() => run("Canned reply sent.", { threadId: selected.id, action: "reply", body: text })}
                      >
                        {text.length > 34 ? `${text.slice(0, 34)}…` : text}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className={`${INPUT} h-20`}
                    placeholder="Reply to the guest — they see this in their app"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={BTN_PRIMARY}
                      disabled={busy || !reply.trim()}
                      onClick={async () => {
                        await run("Reply sent to the guest.", { threadId: selected.id, action: "reply", body: reply });
                        setReply("");
                      }}
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send reply
                    </button>
                    <input
                      className={`${INPUT} max-w-[260px]`}
                      placeholder="resolution note (guest sees it)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <button
                      className={BTN}
                      disabled={busy || !note.trim()}
                      onClick={async () => {
                        await run("Issue resolved.", { threadId: selected.id, action: "resolve", note });
                        setNote("");
                      }}
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

// CHUNK-END

