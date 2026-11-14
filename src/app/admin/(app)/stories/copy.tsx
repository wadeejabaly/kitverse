"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";

/** One tap copies the text, for pasting into Instagram's poll sticker. */
export function CopyText({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked: the text is shown anyway */ }
    }} className="flex w-full items-center justify-between gap-3 rounded-xl border border-line-2 bg-paper px-3 py-2.5 text-start">
      <span className="min-w-0">
        <span className="block text-[11px] text-muted">{label}</span>
        <span className="block truncate text-[15px] font-semibold" dir="rtl">{text}</span>
      </span>
      {done ? <Check className="h-4 w-4 shrink-0 text-green" /> : <Copy className="h-4 w-4 shrink-0 text-muted" />}
    </button>
  );
}
