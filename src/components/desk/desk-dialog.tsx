"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export default function DeskDialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };

    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])")?.focus();

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="desk-dialog-title"
        aria-describedby="desk-dialog-description"
        className="desk-dialog-panel max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-white/15 bg-[#171513] p-5 text-white shadow-2xl sm:rounded-xl sm:p-6"
      >
        <header className="mb-5 flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 id="desk-dialog-title" className="text-base font-bold">{title}</h2>
            <p id="desk-dialog-description" className="mt-1 text-xs leading-relaxed text-white/60">{description}</p>
          </div>
          <button
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            <X size={17} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
