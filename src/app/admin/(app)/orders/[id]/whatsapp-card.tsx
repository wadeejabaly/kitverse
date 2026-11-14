"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Card, SectionTitle, button, cx } from "../../../ui";
import type { WaKind, WaLang } from "@/lib/orders/whatsapp-text";

export interface WaOption {
  kind: WaKind;
  label: string;
  /** text per language, already built on the server */
  text: Record<WaLang, string>;
}

const LANG_LABEL: Record<WaLang, string> = { ar: "العربية", he: "עברית", en: "English" };

/**
 * "Message on WhatsApp" (owner request 2026-11-14): opens the buyer's chat in the owner's WhatsApp
 * Business with the update already written - he presses Send. Nothing is sent from the server.
 * Default language: Hebrew if the buyer wrote their name in Hebrew, else Arabic (changeable here).
 */
export function WhatsAppCard({ phone, options, suggested, defaultLang }: { phone: string | null; options: WaOption[]; suggested: WaKind | null; defaultLang: WaLang }) {
  const [kind, setKind] = useState<WaKind>(suggested ?? options[0].kind);
  const [lang, setLang] = useState<WaLang>(defaultLang);
  const [copied, setCopied] = useState(false);
  const text = options.find((o) => o.kind === kind)!.text[lang];

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };

  return (
    <Card>
      <SectionTitle><span className="inline-flex items-center gap-2"><MessageCircle className="h-3.5 w-3.5" /> Message on WhatsApp</span></SectionTitle>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o.kind} type="button" onClick={() => setKind(o.kind)}
            className={cx("rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition-colors", o.kind === kind ? "bg-pitch-fill text-white ring-pitch-fill" : "text-ink-2 ring-line-2 hover:ring-pitch/40")}>
            {o.label}{o.kind === suggested ? " •" : ""}
          </button>
        ))}
      </div>
      <div className="mb-2 flex gap-1 text-xs">
        {(Object.keys(LANG_LABEL) as WaLang[]).map((l) => (
          <button key={l} type="button" onClick={() => setLang(l)} className={cx("rounded-md px-2 py-0.5", l === lang ? "bg-raised font-semibold text-ink" : "text-muted hover:text-ink")}>{LANG_LABEL[l]}</button>
        ))}
      </div>
      <p dir={lang === "en" ? "ltr" : "rtl"} className="mb-3 whitespace-pre-line rounded-xl bg-raised/60 p-3 text-sm leading-relaxed text-ink-2 ring-1 ring-inset ring-line-2">{text}</p>
      <div className="flex flex-wrap gap-2">
        {phone ? (
          <a href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className={button.whatsapp}>
            <MessageCircle className="h-4 w-4" /> Open in WhatsApp
          </a>
        ) : <span className="text-sm text-red">No usable phone number on this order.</span>}
        <button type="button" onClick={copy} className={button.ghost}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy text"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted">Opens the chat with the message written - you press Send. On iPhone with both WhatsApp apps, pick “Open in WhatsApp Business” if it opens the normal one (or paste the copied text there).</p>
    </Card>
  );
}
