"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { KidsSize } from "@/data/types";
import { KIDS_SIZE_CHART, kidsSizeFor } from "@/data/pricing";

/**
 * Kids size calculator (owner requests 2026-11-15, "add a kids calculator too", then "based on height and
 * weight"): the child's height and weight give the kit size from KIDS_SIZE_CHART (src/data/pricing.ts) -
 * the bigger of the two when they disagree (kidsSizeFor); either one alone also works. Same disclosure
 * pattern as the adult <SizeHelper/>: in the buy box `onPick` writes the size back; on /size-guide it
 * just shows the answer.
 */
export function KidsSizeHelper({ onPick, startOpen = false }: { onPick?: (size: KidsSize) => void; startOpen?: boolean }) {
  const t = useTranslations("product");
  const [open, setOpen] = useState(startOpen);
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");

  const num = (v: string) => (v.trim() ? Number(v) : null);
  const size = kidsSizeFor(num(height), num(weight));
  const row = size ? KIDS_SIZE_CHART.find((r) => r.size === size)! : null;
  const tried = height.trim() !== "" || weight.trim() !== "";

  return (
    <div className="mt-2.5">
      {startOpen ? null : (
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs text-ink underline underline-offset-4">
          {open ? t("sizeHelperHide") : t("kidsHelperOpen")}
        </button>
      )}
      {open ? (
        <div className="mt-3 w-full max-w-sm border border-rule bg-field p-3.5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              {t("kidsHelperHeight")}
              <input type="number" inputMode="numeric" dir="ltr" min={85} max={175} value={height}
                onChange={(e) => setHeight(e.target.value)} placeholder="120"
                className="tabular w-24 border border-rule bg-ground px-3 py-2 text-sm text-ink" />
            </label>
            <span className="pb-2 text-xs text-ink-soft">{t("kidsHelperOr")}</span>
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              {t("kidsHelperWeight")}
              <input type="number" inputMode="decimal" dir="ltr" min={10} max={60} value={weight}
                onChange={(e) => setWeight(e.target.value)} placeholder="22"
                className="tabular w-20 border border-rule bg-ground px-3 py-2 text-sm text-ink" />
            </label>
          </div>
          <p aria-live="polite" className="mt-3 min-h-10 text-sm">
            {row ? (
              <>
                <span>{t("kidsHelperResult", { size: row.size, letter: row.letter, from: row.age[0], to: row.age[1] })}</span>
                <span className="mt-1 block text-xs text-ink-soft">{t("kidsHelperDetail", { minH: row.height[0], maxH: row.height[1], minW: row.weight[0], maxW: row.weight[1], length: row.length, shorts: row.shortsLength })}</span>
                {onPick ? (
                  <button type="button" onClick={() => onPick(row.size)} className="mt-2 inline-block text-xs text-ink underline underline-offset-4">
                    {t("sizeHelperUse", { size: row.size })}
                  </button>
                ) : null}
              </>
            ) : (
              <span className="text-xs text-ink-soft">{tried ? t("kidsHelperOut") : t("kidsHelperHint")}</span>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
