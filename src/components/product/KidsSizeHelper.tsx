"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { KidsSize } from "@/data/types";
import { KIDS_SIZE_CHART, kidsSizeForAge, kidsSizeForHeight } from "@/data/pricing";

/**
 * Kids size calculator (owner request 2026-11-15, "add a kids calculator too"): the child's height - the
 * supplier chart's own measure - or, if unknown, their age, gives the kit size from KIDS_SIZE_CHART
 * (src/data/pricing.ts, the owner's supplier chart). Height wins when both are filled in. Same disclosure
 * pattern as the adult <SizeHelper/>: in the buy box `onPick` writes the size back; on /size-guide it
 * just shows the answer.
 */
export function KidsSizeHelper({ onPick, startOpen = false }: { onPick?: (size: KidsSize) => void; startOpen?: boolean }) {
  const t = useTranslations("product");
  const [open, setOpen] = useState(startOpen);
  const [height, setHeight] = useState("");
  const [age, setAge] = useState("");

  const size = height.trim() ? kidsSizeForHeight(Number(height)) : age.trim() ? kidsSizeForAge(Number(age)) : null;
  const row = size ? KIDS_SIZE_CHART.find((r) => r.size === size)! : null;
  const tried = height.trim() !== "" || age.trim() !== "";

  return (
    <div className="mt-2.5">
      {startOpen ? null : (
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs text-ink underline underline-offset-4">
          {open ? t("sizeHelperHide") : t("kidsHelperOpen")}
        </button>
      )}
      {open ? (
        <div className="mt-3 max-w-sm border border-rule bg-field p-3.5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              {t("kidsHelperHeight")}
              <input type="number" inputMode="numeric" dir="ltr" min={85} max={175} value={height}
                onChange={(e) => setHeight(e.target.value)} placeholder="120"
                className="tabular w-24 border border-rule bg-ground px-3 py-2 text-sm text-ink" />
            </label>
            <span className="pb-2 text-xs text-ink-soft">{t("kidsHelperOr")}</span>
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              {t("kidsHelperAge")}
              <input type="number" inputMode="numeric" dir="ltr" min={2} max={14} value={age}
                onChange={(e) => setAge(e.target.value)} placeholder="6"
                className="tabular w-20 border border-rule bg-ground px-3 py-2 text-sm text-ink" />
            </label>
          </div>
          <p aria-live="polite" className="mt-3 min-h-10 text-sm">
            {row ? (
              <>
                <span>{t("kidsHelperResult", { size: row.size, letter: row.letter, from: row.age[0], to: row.age[1] })}</span>
                <span className="mt-1 block text-xs text-ink-soft">{t("kidsHelperDetail", { minH: row.height[0], maxH: row.height[1], length: row.length, shorts: row.shortsLength })}</span>
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
