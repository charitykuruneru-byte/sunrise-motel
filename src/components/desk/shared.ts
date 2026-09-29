// Shared helpers and types for the v2 front-desk console (/desk).

export const money = (v: number | null | undefined) => `MWK ${Math.round(v ?? 0).toLocaleString("en-US")}`;

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error ?? `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return data as T;
}

export function ageLabel(minutes: number) {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export const ROOM_STATE_LABEL: Record<string, string> = {
  available: "Available",
  occupied: "Occupied",
  dirty: "Dirty",
  clean: "Clean",
  inspected: "Inspected",
  out_of_order: "Out of order",
};

/** Colour language for the room map and the state chips. */
export const ROOM_STATE_STYLE: Record<string, string> = {
  available: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  occupied: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  dirty: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  clean: "bg-teal-500/15 text-teal-200 border-teal-500/40",
  inspected: "bg-indigo-500/15 text-indigo-200 border-indigo-500/40",
  out_of_order: "bg-rose-500/20 text-rose-200 border-rose-500/50",
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  placed: "New",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  delivered: "Delivered",
  rejected: "Rejected",
};

export const THREAD_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
  escalated: "Escalated",
};

export const CARD = "rounded-lg border border-white/10 bg-white/[0.03] p-4";
export const BTN =
  "inline-flex items-center gap-1.5 rounded border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10 disabled:opacity-40";
export const BTN_PRIMARY =
  "inline-flex items-center gap-1.5 rounded bg-[#f28c18] px-2.5 py-1.5 text-xs font-bold text-[#171513] hover:bg-[#ffa53a] disabled:opacity-40";
export const BTN_DANGER =
  "inline-flex items-center gap-1.5 rounded border border-rose-500/50 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-40";
export const INPUT =
  "w-full rounded border border-white/15 bg-black/30 px-2.5 py-1.5 text-sm text-white placeholder-white/35 outline-none focus:border-[#f28c18]";
