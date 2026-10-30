"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Size, Version } from "@/data/types";
import { recommendSize } from "@/lib/agent/sizing";

const MIN_HEIGHT = 140;
const MAX_HEIGHT = 210;
const MIN_WEIGHT = 35;
const MAX_WEIGHT = 160;

/**
 * Height/weight → size recommendation (owner request 2026-10-30: "a size
 * helper were you put your weight and height and it recomends your size").
 *
 * recommendSize() is imported straight from the Instagram bot's own sizing
 * rules (src/lib/agent/sizing.ts, "the owner's own rules of thumb in the
 * DMs") rather than re-derived here, so a shopper on the website and a
 * customer in DMs always get the same answer for the same numbers — the
 * same single-source-of-truth pattern src/data/pricing.ts already is for
 * price.
 *
 * Self-contained on purpose: its own fan/player toggle, its own open/closed
 * disclosure, its own result — so it drops into the product buy box (where
 * `onPick` writes the result back into that page's own size selection) and
 * the standalone /size-guide page (no `onPick` there — that page has no
 * size selection of its own to write into) the same way, with no state to
 * lift in either caller.
 */
export function SizeHelper({
  initialVersion = "fan",
  onPick,
}: {
  /** Which cut to assume until the shopper says otherwise — pass the buy
   *  box's current fan/player pick so the helper starts in step with it. */
  initialVersion?: Version;
  /** When given, shows a "use this size" button that writes the result back
   *  into the caller's own size state. */
  onPick?: (size: Size) => void;
}) {
  const t = useTranslations("product");
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState<Version>(initialVersion);
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");

  const heightCm = Number(height);
  const weightKg = Number(weight);
  const valid =
    height.trim() !== "" &&
    weight.trim() !== "" &&
    Number.isFinite(heightCm) &&
    Number.isFinite(weightKg) &&
    heightCm >= MIN_HEIGHT &&
    heightCm <= MAX_HEIGHT &&
    weightKg >= MIN_WEIGHT &&
    weightKg <= MAX_WEIGHT;

  const result = valid ? recommendSize(heightCm, weightKg, version) : null;

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-ink underline underline-offset-4"
      >
        {open ? t("sizeHelperHide") : t("sizeHelperOpen")}
      </button>

      {open ? (
        <div className="mt-3 max-w-sm border border-rule bg-field p-3.5">
          <div className="mb-3 flex flex-wrap gap-2">
            {(["fan", "player"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={version === option}
                onClick={() => setVersion(option)}
                className={`border px-3 py-1.5 text-xs transition-colors ${
                  version === option ? "border-ink bg-chip" : "border-rule hover:border-ink"
                }`}
              >
                {option === "fan" ? t("versionFan") : t("versionPlayer")}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              {t("sizeHelperHeight")}
              <input
                type="number"
                inputMode="numeric"
                dir="ltr"
                min={MIN_HEIGHT}
                max={MAX_HEIGHT}
                value={height}
                onChange={(event) => setHeight(event.target.value)}
                placeholder="175"
                className="tabular w-24 border border-rule bg-ground px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              {t("sizeHelperWeight")}
              <input
                type="number"
                inputMode="numeric"
                dir="ltr"
                min={MIN_WEIGHT}
                max={MAX_WEIGHT}
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                placeholder="78"
                className="tabular w-24 border border-rule bg-ground px-3 py-2 text-sm text-ink"
              />
            </label>
          </div>

          <p aria-live="polite" className="mt-3 min-h-10 text-sm">
            {result ? (
              <>
                <span>{t("sizeHelperResult", { size: result.recommended })}</span>
                {result.if_you_like_it_loose !== result.recommended ? (
                  <span className="mt-1 block text-xs text-ink-soft">
                    {t("sizeHelperLoose", { size: result.if_you_like_it_loose })}
                  </span>
                ) : null}
                {onPick ? (
                  <button
                    type="button"
                    onClick={() => onPick(result.recommended)}
                    className="mt-2 inline-block text-xs text-ink underline underline-offset-4"
                  >
                    {t("sizeHelperUse", { size: result.recommended })}
                  </button>
                ) : null}
              </>
            ) : (
              <span className="text-xs text-ink-soft">{t("sizeHelperHint")}</span>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
