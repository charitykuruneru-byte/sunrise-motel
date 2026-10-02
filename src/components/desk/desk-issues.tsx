"use client";

import { AlertTriangle, CheckCheck, Loader2, MessageSquare, Search, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ageLabel, BTN, BTN_DANGER, BTN_PRIMARY, INPUT, money, THREAD_STATUS_LABEL } from "./shared";

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
  const [query, setQuery] = useState("");
  const [sendNotice, setSendNotice] = useState<{ threadId: string; sentAt: string } | null>(null);

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
  const filteredRooms = rooms
    .map((room) => ({
      ...room,
      threads: room.threads.filter((thread) =>
        `${thread.guestName ?? ""} ${thread.subject ?? ""} ${thread.roomNumber ?? ""} ${thread.kind}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    }))
    .filter((room) => room.threads.length > 0);

  const formatMessageTime = (value: string) => new Date(value).toLocaleString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });

  const run = async (label: string, payload: Record<string, unknown>) => {
    if (readOnly) return false;
    setBusy(true);
    let succeeded = false;
    try {
      await api("/api/desk/issues", { method: "POST", body: JSON.stringify(payload) });
      succeeded = true;
      setToast(label);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "That action failed.");
      setBusy(false);
      return false;
    }
    try {
      await load();
      await onChanged();
    } catch (error) {
      setToast(
        succeeded
          ? `${label} The inbox could not refresh: ${error instanceof Error ? error.message : "refresh failed."}`
          : error instanceof Error ? error.message : "That action failed.",
      );
    } finally {
      setBusy(false);
    }
    return succeeded;
  };

  const sendReply = async (body: string) => {
    const text = body.trim();
    if (!text || busy || !selected || readOnly) return;
    setSendNotice(null);
    const sent = await run("Reply sent to the guest.", {
      threadId: selected.id,
      action: "reply",
      body: text,
    });
    if (sent) {
      setReply("");
      setSendNotice({
        threadId: selected.id,
        sentAt: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      });
    }
  };

  return (
    <div className="desk-messenger" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
      <section className="desk-manager-page-heading">
        <div>
          <span className="desk-manager-eyebrow"><MessageSquare size={14} /> GUEST SERVICE</span>
          <h2>Messages &amp; issues</h2>
          <p>Stay on top of guest conversations and requests.</p>
        </div>
        <div className="desk-message-stats" aria-label="Message summary">
          <span><strong>{totals.open}</strong> open</span>
          <span><strong>{totals.unacknowledged}</strong> new</span>
          <span><strong>{totals.escalated}</strong> escalated</span>
          {totals.emergencies > 0 && (
            <span className="desk-message-emergency"><AlertTriangle size={13} /> {totals.emergencies} urgent</span>
          )}
        </div>
      </section>

      <section className="desk-messenger-panel" aria-label="Guest messages">
        <aside className={`desk-conversation-list ${selected ? "desk-conversation-list-has-selection" : ""}`}>
          <div className="desk-conversation-list-head">
            <div>
              <h3>Conversations</h3>
              <span>{threads.length} {threads.length === 1 ? "thread" : "threads"}</span>
            </div>
            <label className="desk-conversation-search">
              <Search size={15} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guests or rooms" aria-label="Search conversations" />
            </label>
          </div>
          <div className="desk-conversation-scroll">
            {filteredRooms.length === 0 && (
              <p className="desk-conversation-empty">{rooms.length ? "No conversations match your search." : "No open conversations right now."}</p>
            )}
            {filteredRooms.map((room) => (
              <div className="desk-conversation-group" key={room.roomNumber}>
                <p className={`desk-conversation-group-label ${room.emergency ? "is-urgent" : ""}`}>
                  {room.emergency && <AlertTriangle size={12} />}
                  {room.roomNumber === "unassigned" ? "Unassigned room" : `Room ${room.roomNumber}`}
                  <span>{room.threads.length}</span>
                </p>
                {room.threads.map((thread) => {
                  const lastMessage = thread.messages[thread.messages.length - 1];
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      aria-pressed={openId === thread.id}
                      onClick={() => {
                        setOpenId(thread.id);
                        setSendNotice(null);
                      }}
                      className={`desk-conversation-item ${openId === thread.id ? "is-selected" : ""}`}
                    >
                      <span className="desk-conversation-avatar" aria-hidden="true">
                        {(thread.guestName ?? "?").trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="desk-conversation-item-copy">
                        <span className="desk-conversation-item-top">
                          <strong>{thread.guestName ?? "Guest"}</strong>
                          <time>{ageLabel(thread.ageMinutes)}</time>
                        </span>
                        <span className="desk-conversation-subject">{thread.subject ?? thread.kind}</span>
                        <span className="desk-conversation-preview">
                          {lastMessage?.body ?? THREAD_STATUS_LABEL[thread.status] ?? thread.status}
                        </span>
                      </span>
                      {thread.priority !== "normal" && <span className="desk-conversation-priority">{thread.priority}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        <div className={`desk-conversation ${selected ? "" : "desk-conversation-empty-state"}`}>
          {!selected && (
            <div className="desk-conversation-welcome">
              <span><MessageSquare size={25} /></span>
              <h3>Select a conversation</h3>
              <p>Choose a guest from the list to read and respond to their message.</p>
            </div>
          )}
          {selected && (
            <>
              <header className="desk-conversation-header">
                <div className="desk-conversation-guest">
                  <span className="desk-conversation-avatar desk-conversation-avatar-large" aria-hidden="true">
                    {(selected.guestName ?? "?").trim().charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <h3>{selected.guestName ?? "Guest"}</h3>
                    <p>{selected.roomNumber ? `Room ${selected.roomNumber}` : "No room assigned"} · {selected.subject ?? selected.kind}</p>
                  </div>
                </div>
                <div className="desk-conversation-actions">
                  <span className={`desk-conversation-status ${selected.status === "open" ? "is-open" : ""}`}>
                    {THREAD_STATUS_LABEL[selected.status] ?? selected.status}
                  </span>
                  {!readOnly && (
                    <>
                      <button className={BTN} disabled={busy} onClick={() => run("Thread acknowledged.", { threadId: selected.id, action: "acknowledge" })}>
                        Acknowledge
                      </button>
                      <button className={BTN} disabled={busy} onClick={() => run("Escalated to the admin.", { threadId: selected.id, action: "escalate" })}>
                        Escalate
                      </button>
                      <button className={BTN_DANGER} disabled={busy} onClick={() => run("Thread closed.", { threadId: selected.id, action: "close" })}>
                        Close
                      </button>
                    </>
                  )}
                </div>
              </header>

              <details className="desk-conversation-context">
                <summary>Stay &amp; guest details</summary>
                <div>
                  <span>Stay: {selected.context.stay ? `${selected.context.stay.checkIn} → ${selected.context.stay.checkOut}` : "—"}</span>
                  <span>Folio balance: {money(selected.context.folioBalance)}</span>
                  <span>Open orders: {selected.context.openOrders}</span>
                  <span>{selected.context.firstTime ? "First-time guest" : `${selected.context.previousStays} previous stay(s)`}</span>
                  <span>Previous complaints: {selected.context.previousComplaints}</span>
                  <span>App account: {selected.context.appAccount ?? "none"}</span>
                </div>
              </details>

              <div className="desk-message-history" aria-label="Message history">
                {selected.messages.map((message) => {
                  const fromDesk = message.direction === "desk_to_guest";
                  return (
                    <div key={message.id} className={`desk-message-row ${fromDesk ? "is-from-desk" : "is-from-guest"}`}>
                      {!fromDesk && <span className="desk-message-avatar" aria-hidden="true">{(selected.guestName ?? "?").trim().charAt(0).toUpperCase()}</span>}
                      <div className="desk-message-content">
                        <p className="desk-message-sender">{fromDesk ? `Front desk${message.senderLabel ? ` · ${message.senderLabel}` : ""}` : selected.guestName ?? "Guest"}</p>
                        <div className="desk-message-bubble">
                          {message.kind !== "message" && <span className="desk-message-kind">{message.kind}</span>}
                          <p>{message.body}</p>
                        </div>
                        <time className="desk-message-time">
                          {formatMessageTime(message.createdAt)}
                          {fromDesk && message.readByGuestAt && <CheckCheck size={13} aria-label="Read by guest" />}
                        </time>
                      </div>
                    </div>
                  );
                })}
                {selected.messages.length === 0 && <p className="desk-message-no-history">No messages yet. Send a reply to start the conversation.</p>}
              </div>

              {!readOnly && (
                <div className="desk-message-composer">
                  <div className="desk-canned-replies" aria-label="Suggested replies">
                    {CANNED.map((text) => (
                      <button key={text} disabled={busy} onClick={() => void sendReply(text)}>
                        {text.length > 34 ? `${text.slice(0, 34)}…` : text}
                      </button>
                    ))}
                  </div>
                  <div className="desk-message-compose-row">
                    <textarea
                      className={INPUT}
                      placeholder="Write a message..."
                      aria-label="Reply to guest"
                      value={reply}
                      onChange={(event) => {
                        setReply(event.target.value);
                        setSendNotice(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendReply(reply);
                        }
                      }}
                    />
                    <button
                      className={BTN_PRIMARY}
                      aria-label="Send reply"
                      disabled={busy || !reply.trim()}
                      onClick={() => void sendReply(reply)}
                    >
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} <span>Send</span>
                    </button>
                  </div>
                  {sendNotice?.threadId === selected.id && (
                    <p className="desk-message-send-confirmation" role="status" aria-live="polite">
                      <CheckCheck size={15} />
                      <span>Message sent to {selected.guestName ?? "guest"} · {sendNotice.sentAt}</span>
                    </p>
                  )}
                  <div className="desk-resolve-row">
                    <input className={INPUT} placeholder="Resolution note" aria-label="Resolution note" value={note} onChange={(event) => setNote(event.target.value)} />
                    <button
                      className={BTN}
                      disabled={busy || !note.trim()}
                      onClick={async () => {
                        await run("Issue resolved.", { threadId: selected.id, action: "resolve", note });
                        setNote("");
                      }}
                    >
                      Resolve issue
                    </button>
                    <span>Enter to send · Shift+Enter for a new line</span>
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
