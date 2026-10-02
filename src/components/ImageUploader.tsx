'use client'
import { useRef, useState } from 'react'

type Props = {
  onUploadComplete: (url: string) => void;
  currentImage?: string | null;
  previewAlt?: string;
  onUploadStateChange?: (uploading: boolean) => void;
};

// File-picker uploader: drag & drop or click, preview + progress,
// uploads to /api/upload (Vercel Blob) and returns the public URL.
export default function ImageUploader({ onUploadComplete, currentImage, previewAlt = "Upload preview", onUploadStateChange }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setError("");
    setDone(false);
    setPreview(URL.createObjectURL(file));
    setProgress(0);
    onUploadStateChange?.(true);
    const tick = window.setInterval(() => setProgress((p) => (p === null ? 0 : Math.min(90, p + 15))), 250);
    try {
      const form = new FormData();
      form.append("file", file);
      // Indeterminate-ish progress (fetch has no upload events): animate to 90%.
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed.");
      setProgress(100);
      setDone(true);
      onUploadComplete(data.url);
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      window.clearInterval(tick);
      onUploadStateChange?.(false);
    }
  };

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void upload(file);
  };

  return (
    <div style={{ border: '1px dashed var(--line)', borderRadius: 8, padding: 14, display: 'grid', gap: 10 }}>
      {(preview || currentImage) && (
        <img src={preview ?? currentImage ?? ''} alt={previewAlt} style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 6 }} />
      )}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}
        style={{ border: '1px dashed var(--line)', borderRadius: 6, padding: '18px 12px', textAlign: 'center', cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}
      >
        Drag &amp; drop an image here, or <strong>click to upload</strong>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files)} />
      </div>
      {progress !== null && (
        <div style={{ height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--orange)', transition: 'width .25s' }} />
        </div>
      )}
      {done && <span style={{ fontSize: 12, color: 'var(--sage)', fontWeight: 700 }}>Uploaded!</span>}
      {error && <span style={{ fontSize: 12, color: '#c62828' }}>{error}</span>}
    </div>
  );
}
