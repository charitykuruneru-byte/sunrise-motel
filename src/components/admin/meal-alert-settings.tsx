"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Save } from "lucide-react";

type MealSetting = {
  id: string;
  mealType: string;
  enabled: boolean;
  title: string;
  message: string;
  startTime: string;
  endTime: string;
  popupDurationMinutes: number;
  ctaText: string;
  imageUrl: string | null;
};

const emptySetting = (): Omit<MealSetting, "id"> => ({
  mealType: "custom",
  enabled: true,
  title: "",
  message: "",
  startTime: "15:00",
  endTime: "16:00",
  popupDurationMinutes: 30,
  ctaText: "View Live Menu",
  imageUrl: null,
});

export default function MealAlertSettings() {
  const [settings, setSettings] = useState<MealSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Omit<MealSetting, "id"> | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/notifications-settings", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load meal alerts.");
      setSettings(data.settings ?? []);
      setPreviewId(data.settings?.[0]?.id ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load meal alerts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const updateLocal = (id: string, patch: Partial<MealSetting>) => {
    setPreviewId(id);
    setSettings((current) => current.map((setting) => setting.id === id ? { ...setting, ...patch } : setting));
  };

  const save = async (setting: MealSetting) => {
    setSavingId(setting.id);
    setError("");
    try {
      const response = await fetch("/api/admin/notifications-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setting),
      });
      const data = await response.json();
      if (!response.ok || !data.setting) throw new Error(data.error || "Could not save this meal alert.");
      updateLocal(setting.id, data.setting);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this meal alert.");
    } finally {
      setSavingId("");
    }
  };

  const saveCustom = async () => {
    if (!draft) return;
    setSavingId("new");
    setError("");
    try {
      const response = await fetch("/api/admin/notifications-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok || !data.setting) throw new Error(data.error || "Could not add the custom alert.");
      setSettings((current) => [...current, data.setting].sort((a, b) => a.startTime.localeCompare(b.startTime)));
      setDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the custom alert.");
    } finally {
      setSavingId("");
    }
  };
  const previewSetting = draft ?? settings.find((setting) => setting.id === previewId) ?? settings.find((setting) => setting.enabled);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Meal alerts</h3>
          <p className="text-sm text-slate-600">Control guest popups using Malawi time (Africa/Blantyre).</p>
        </div>
        {!draft && <button type="button" className="admin-btn admin-btn-primary" onClick={() => setDraft(emptySetting())}><Plus size={14} /> Add custom alert</button>}
      </div>
      {error && <p className="booking-error-banner" role="alert">{error}</p>}
      {loading ? <div className="empty-state"><Loader2 size={20} className="spin" /><p>Loading meal alerts…</p></div> : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.8fr)]">
          <div className="space-y-3">
            {settings.map((setting) => (
              <article key={setting.id} className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{setting.mealType.replaceAll("_", " ")}</span>
                    <h4 className="text-base font-bold text-slate-900">{setting.title}</h4>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={setting.enabled} onChange={(event) => updateLocal(setting.id, { enabled: event.target.checked })} />
                    {setting.enabled ? "Enabled" : "Paused"}
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">Title
                    <input className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900" maxLength={160} value={setting.title} onChange={(event) => updateLocal(setting.id, { title: event.target.value })} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Popup duration (minutes)
                    <input className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900" type="number" min={1} max={1440} value={setting.popupDurationMinutes} onChange={(event) => updateLocal(setting.id, { popupDurationMinutes: Number(event.target.value) })} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Starts (CAT)
                    <input className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900" type="time" value={setting.startTime} onChange={(event) => updateLocal(setting.id, { startTime: event.target.value })} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Ends (CAT)
                    <input className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900" type="time" value={setting.endTime} onChange={(event) => updateLocal(setting.id, { endTime: event.target.value })} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Guest message
                    <textarea className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900" rows={2} maxLength={2000} value={setting.message} onChange={(event) => updateLocal(setting.id, { message: event.target.value })} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Button label
                    <input className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900" maxLength={80} value={setting.ctaText} onChange={(event) => updateLocal(setting.id, { ctaText: event.target.value })} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Promo image URL (optional)
                    <input className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900" value={setting.imageUrl ?? ""} onChange={(event) => updateLocal(setting.id, { imageUrl: event.target.value || null })} />
                  </label>
                </div>
                <div className="mt-4 flex justify-end">
                  <button type="button" className="admin-btn admin-btn-primary" disabled={savingId === setting.id} onClick={() => void save(setting)}>
                    {savingId === setting.id ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Save alert
                  </button>
                </div>
              </article>
            ))}
            {draft && (
              <article className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
                <h4 className="mb-3 font-bold text-slate-900">New custom alert</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">Title<input className="mt-1 w-full rounded-lg border p-2 text-sm" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
                  <label className="text-xs font-semibold text-slate-600">Button label<input className="mt-1 w-full rounded-lg border p-2 text-sm" value={draft.ctaText} onChange={(event) => setDraft({ ...draft, ctaText: event.target.value })} /></label>
                  <label className="text-xs font-semibold text-slate-600">Starts (CAT)<input className="mt-1 w-full rounded-lg border p-2 text-sm" type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} /></label>
                  <label className="text-xs font-semibold text-slate-600">Ends (CAT)<input className="mt-1 w-full rounded-lg border p-2 text-sm" type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} /></label>
                  <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Message<textarea className="mt-1 w-full rounded-lg border p-2 text-sm" rows={2} value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} /></label>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setDraft(null)}>Cancel</button>
                  <button type="button" className="admin-btn admin-btn-primary" disabled={savingId === "new" || !draft.title.trim() || !draft.message.trim()} onClick={() => void saveCustom()}>
                    {savingId === "new" ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Add alert
                  </button>
                </div>
              </article>
            )}
          </div>
          <aside className="h-fit rounded-2xl border border-slate-200/70 bg-[#0f172a] p-5 text-white shadow-xl">
            <span className="text-xs font-bold tracking-wider text-emerald-300">LIVE PREVIEW · GUEST APP</span>
            {previewSetting?.imageUrl && <img src={previewSetting.imageUrl} alt="" className="mt-3 h-28 w-full rounded-xl object-cover" />}
            <p className="mt-3 text-lg font-bold">{previewSetting?.title || "Meal time!"}</p>
            <p className="mt-2 text-sm text-white/75">{previewSetting?.message || "Your message preview will appear here."}</p>
            <div className="mt-5 inline-flex rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold">{previewSetting?.ctaText || "View Live Menu"}</div>
          </aside>
        </div>
      )}
    </div>
  );
}
