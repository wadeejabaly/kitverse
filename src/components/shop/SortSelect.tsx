"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { SORTS, type SortKey } from "@/lib/shop-href";

/**
 * Sort control for /shop and every collection (redesign phase 2). Keeps all
 * current filters in the URL and only swaps `sort`, so a sorted, filtered view
 * is linkable like every other state of the listing. "featured" is the
 * catalog's own order and is the default, so it is dropped from the URL.
 */
export function SortSelect({ value }: { value: SortKey }) {
  const t = useTranslations("shop");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <label className="flex items-center gap-2.5 text-[13px] text-ink-soft">
      <span className="hidden sm:inline">{t("sortLabel")}</span>
      <select
        className="kv-select"
        value={value}
        aria-label={t("sortLabel")}
        onChange={(event) => {
          const next = new URLSearchParams(params.toString());
          if (event.target.value === "featured") next.delete("sort");
          else next.set("sort", event.target.value);
          const search = next.toString();
          router.push(search ? `${pathname}?${search}` : pathname, { scroll: false });
        }}
      >
        {SORTS.map((key) => (
          <option key={key} value={key}>
            {t(`sort.${key}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
