import Link from "next/link";
import { Download } from "lucide-react";
import { button, cx } from "../../../../ui";
import type { SheetLang } from "@/lib/orders/supplier-sheet";

const LABEL: Record<SheetLang, string> = { en: "English", zh: "中文" };

/**
 * English / 中文 switch (owner requests 2026-11-17): changes the batch table on this page AND the Excel download,
 * so the owner can screenshot or download it in Chinese for the supplier. Kept in the URL (?lang=zh).
 */
export function SheetDownload({ batchId, lang }: { batchId: string; lang: SheetLang }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex gap-1 rounded-lg p-0.5 text-xs ring-1 ring-inset ring-line-2">
        {(Object.keys(LABEL) as SheetLang[]).map((l) => (
          <Link key={l} href={`/admin/orders/batches/${batchId}${l === "zh" ? "?lang=zh" : ""}`} replace scroll={false} aria-current={l === lang ? "true" : undefined}
            className={cx("rounded-md px-2 py-1", l === lang ? "bg-raised font-semibold text-ink" : "text-muted hover:text-ink")}>
            {LABEL[l]}
          </Link>
        ))}
      </span>
      <a href={`/admin/orders/batches/${batchId}/xlsx${lang === "zh" ? "?lang=zh" : ""}`} className={button.primary}>
        <Download className="h-4 w-4" /> {lang === "zh" ? "Download Excel (中文)" : "Download Excel"}
      </a>
    </span>
  );
}
