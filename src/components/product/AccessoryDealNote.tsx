"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { accessoryDeal } from "@/data/pricing";

const noSubscribe = () => () => {};

/**
 * "Today only: ₪40 with a shirt" (owner request 2026-11-10, scarves). The page
 * is static, so whether the deal is on is decided in the visitor's browser
 * from the price list's own start/end - it disappears by itself when the deal
 * ends. The server charges by the same price list either way.
 */
export function AccessoryDealNote({ category, className = "" }: { category: string; className?: string }) {
  const t = useTranslations("accessories");
  const price = useSyncExternalStore(noSubscribe, () => accessoryDeal(category)?.price ?? null, () => null);
  if (price == null) return null;
  return (
    <p className={`rounded-[10px] border border-[#f0c36d] bg-[#fff8e6] px-4 py-3 text-sm font-semibold text-[#5c4100] ${className}`}>
      {t("dealBadge", { price: String(price) })}
    </p>
  );
}
