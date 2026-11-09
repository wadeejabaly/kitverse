"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * The filter rail's phone behaviour (redesign phase 2): on a phone the rail
 * used to stack ABOVE the products, so a shopper scrolled past every league
 * and team before seeing a shirt. Now it folds behind a "Filters" button;
 * from the `wide` breakpoint up it is always open beside the grid, exactly as
 * before. The filters themselves are still plain links — this only toggles
 * visibility, so nothing about how they work changed.
 */
export function MobileFilters({
  active,
  children,
}: {
  /** How many filters are applied, shown on the button. */
  active: number;
  children: React.ReactNode;
}) {
  const t = useTranslations("shop");
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0 self-start wide:sticky wide:top-28">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="kv-opt w-full justify-between wide:hidden"
      >
        <span className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M2 4h12M4.5 8h7M6.5 12h3" strokeLinecap="round" />
          </svg>
          {t("filters")}
          {active > 0 ? (
            <span className="grid min-w-5 place-items-center rounded-full bg-[#1f5cff] px-1.5 text-[11px] leading-5 text-white">
              {active}
            </span>
          ) : null}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M3.5 6 8 10.5 12.5 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className={`${open ? "mt-3 flex" : "hidden"} kv-panel kv-filters flex-col gap-5 wide:mt-0 wide:flex`}>
        {children}
      </div>
    </div>
  );
}
