"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { button, cx } from "../../../../ui";

type Lang = "en" | "zh";
const KEY = "kv_sheet_lang";
const LABEL: Record<Lang, string> = { en: "English", zh: "中文" };

/** "Download Excel" with an English / 中文 switch (owner request 2026-11-17); the last choice is remembered. */
export function SheetDownload({ batchId }: { batchId: string }) {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "zh") setLang("zh"); // eslint-disable-line react-hooks/set-state-in-effect
    } catch {}
  }, []);
  const pick = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {}
  };
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex gap-1 rounded-lg p-0.5 text-xs ring-1 ring-inset ring-line-2">
        {(Object.keys(LABEL) as Lang[]).map((l) => (
          <button key={l} type="button" onClick={() => pick(l)} aria-pressed={l === lang}
            className={cx("rounded-md px-2 py-1", l === lang ? "bg-raised font-semibold text-ink" : "text-muted hover:text-ink")}>
            {LABEL[l]}
          </button>
        ))}
      </span>
      <a href={`/admin/orders/batches/${batchId}/xlsx${lang === "zh" ? "?lang=zh" : ""}`} className={button.primary}>
        <Download className="h-4 w-4" /> {lang === "zh" ? "Download Excel (中文)" : "Download Excel"}
      </a>
    </span>
  );
}
