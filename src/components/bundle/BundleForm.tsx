"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ADDONS, GIFT_BOX_PRICE, SIZES, patchPrice, patchesTotal, priceFor, sizeSurcharge } from "@/data/pricing";
import { CHEST_PATCHES, patchPieces, sleevePatches, togglePatchIn } from "@/lib/patch-limits";
import type { Kind, PatchId, Size } from "@/data/types";
import { maxPatchesFor, patchOptionsFor } from "@/data/patches";
import { useCart } from "@/components/cart/CartProvider";
import { Figure, Price } from "@/components/shared/Money";
import { NAME_NUMBER_MAX, sanitizeNameNumber } from "@/lib/product";
import { OptionButton, patchLabel } from "@/components/product/ProductForm";
import { BUNDLE_VERSION } from "@/data/bundles";

export interface BundleShirt {
  handle: string;
  season: string;
  league: string | null;
  team: string;
  kind: Kind;
  image: string;
  title: string;
  kitLabel: string;
}

interface ShirtChoice {
  size: Size;
  personalise: boolean;
  nameNumber: string;
  patches: PatchId[];
}

const START: ShirtChoice = { size: "M", personalise: false, nameNumber: "", patches: [] };

/**
 * The bundle buy box (owner request 2026-11-12): the club's three shirts, each customised on its own,
 * one optional gift box for the bundle, one add-to-cart. Every figure comes from src/data/pricing.ts,
 * exactly like the product page - adding puts three ordinary player-version lines in the cart (and one
 * gift box on the order), which checkout and the server price the usual way.
 */
export function BundleForm({ shirts, leagueName, bundleTitle }: { shirts: BundleShirt[]; leagueName: string | null; bundleTitle: string }) {
  const t = useTranslations("bundle");
  const tp = useTranslations("product");
  const tCommon = useTranslations("common");
  const { add, giftBoxes, setGiftBoxes, count: cartCount } = useCart();
  const [choices, setChoices] = useState<ShirtChoice[]>(() => shirts.map(() => START));
  const [giftBox, setGiftBox] = useState(true);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 8000);
    return () => window.clearTimeout(timer);
  }, [added]);

  const update = (index: number, patch: Partial<ShirtChoice>) =>
    setChoices((current) => current.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  const unitPrices = shirts.map((shirt, i) => {
    const c = choices[i];
    const name = c.personalise ? sanitizeNameNumber(c.nameNumber).trim() : "";
    return priceFor(shirt.season, c.size, BUNDLE_VERSION) + (name ? ADDONS.nameNumber : 0) + patchesTotal(patchPieces(c.patches, false));
  });
  const total = unitPrices.reduce((s, p) => s + p, 0) + (giftBox ? GIFT_BOX_PRICE : 0);

  function onAdd() {
    shirts.forEach((shirt, i) => {
      const c = choices[i];
      const name = c.personalise ? sanitizeNameNumber(c.nameNumber).trim() : "";
      add({
        kind: "jersey",
        handle: shirt.handle,
        size: c.size,
        version: BUNDLE_VERSION,
        sleeve: "short",
        patches: c.patches,
        qty: 1,
        ...(name ? { nameNumber: name } : {}),
      });
    });
    if (giftBox) setGiftBoxes(giftBoxes + 1);
    setAdded(true);
  }

  return (
    <div>
      <ol className="grid gap-5">
        {shirts.map((shirt, i) => (
          <li key={shirt.handle}>
            <ShirtCard
              shirt={shirt}
              index={i}
              choice={choices[i]}
              unitPrice={unitPrices[i]}
              leagueName={leagueName}
              onChange={(patch) => update(i, patch)}
              t={t}
              tp={tp}
            />
          </li>
        ))}
      </ol>

      {/* One gift box for the whole bundle (owner decision 2026-11-12). */}
      <fieldset className="mt-6 border-0 p-0">
        <legend className="kv-legend">{t("giftBoxLegend")}</legend>
        <label className="kv-opt w-full cursor-pointer items-start" data-pressed={giftBox}>
          <input type="checkbox" checked={giftBox} onChange={(e) => setGiftBox(e.target.checked)} className="mt-1 size-4 accent-[#1f5cff]" />
          <span>
            {t("giftBoxToggle")}
            <small className="ms-1.5 text-ink-soft">
              <Figure>+₪{GIFT_BOX_PRICE}</Figure>
            </small>
          </span>
        </label>
      </fieldset>

      <div className="mt-6 rounded-[14px] border border-rule bg-tile p-5">
        <ul className="grid gap-1.5 text-[13.5px] text-ink-soft">
          {shirts.map((shirt, i) => (
            <li key={shirt.handle} className="flex justify-between gap-4">
              <span>{shirt.kitLabel}</span>
              <Price value={unitPrices[i]} />
            </li>
          ))}
          {giftBox ? (
            <li className="flex justify-between gap-4">
              <span>{t("giftBoxLegend")}</span>
              <Price value={GIFT_BOX_PRICE} />
            </li>
          ) : null}
        </ul>
        <div className="mt-3 flex items-end justify-between gap-4 border-t border-rule pt-3">
          <span className="font-bold text-ink">{t("total")}</span>
          <Price value={total} className="text-[1.75rem] leading-none font-extrabold text-ink" />
        </div>
        <p className="mt-2 text-xs text-ink-soft">{t("totalNote")}</p>
        <button type="button" onClick={onAdd} className="btn mt-4 w-full">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M3.2 5.5h9.6l-.8 8.3H4z" strokeLinejoin="round" />
            <path d="M6 7.2V4.8a2 2 0 0 1 4 0v2.4" strokeLinecap="round" />
          </svg>
          {t("addBundle")}
        </button>
      </div>

      <div aria-live="polite">
        {added ? (
          <div className="kv-toast" role="status">
            <div className="flex items-start gap-3">
              <div className="min-w-0 grow">
                <p className="flex items-center gap-2 text-[14px] font-bold text-white">
                  <span className="grid size-5 place-items-center rounded-full bg-[#1f5cff]">
                    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8.3 6.3 11.5 13 4.5" />
                    </svg>
                  </span>
                  {t("added")}
                </p>
                <p className="mt-1 truncate text-[13px] text-white/80">{bundleTitle}</p>
                <p className="mt-0.5 text-[12px] text-white/60">
                  <Price value={total} />
                </p>
              </div>
              <button type="button" onClick={() => setAdded(false)} aria-label={tCommon("close")} className="grid size-7 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3 3l10 10M13 3 3 13" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link href="/cart" className="rounded-[8px] border border-white/20 px-3 py-2.5 text-center text-[13px] font-semibold text-white hover:bg-white/10">
                {tp("viewCart")} (<Figure>{cartCount}</Figure>)
              </Link>
              <Link href="/checkout" className="rounded-[8px] bg-[#1f5cff] px-3 py-2.5 text-center text-[13px] font-bold text-white hover:bg-[#3a72ff]">
                {tCommon("checkout")}
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type T = (key: string, values?: Record<string, string | number>) => string;

function ShirtCard({
  shirt, index, choice, unitPrice, leagueName, onChange, t, tp,
}: {
  shirt: BundleShirt; index: number; choice: ShirtChoice; unitPrice: number; leagueName: string | null;
  onChange: (patch: Partial<ShirtChoice>) => void; t: T; tp: T;
}) {
  const options = patchOptionsFor({ league: shirt.league, kind: shirt.kind, team: shirt.team, season: shirt.season });
  const max = maxPatchesFor({ league: shirt.league, kind: shirt.kind, season: shirt.season });
  const pieces = patchPieces(choice.patches, false);
  const fieldId = `bundle-name-${index}`;

  return (
    <section className="kv-panel !p-4 sm:!p-5" aria-label={shirt.title}>
      <header className="mb-4 flex items-center gap-3">
        <span className="relative block size-16 shrink-0 overflow-hidden rounded-[10px] bg-tile">
          <Image src={shirt.image} alt="" fill sizes="64px" className="object-contain" />
        </span>
        <div className="min-w-0 grow">
          <p className="mono-eyebrow text-ink-soft">{t("shirtN", { n: index + 1 })}</p>
          <p className="truncate font-extrabold text-ink">{shirt.kitLabel}</p>
        </div>
        <Price value={unitPrice} className="shrink-0 text-lg font-extrabold text-ink" />
      </header>

      <fieldset className="mb-5 border-0 p-0">
        <legend className="kv-legend">
          <span>{tp("size")}</span>
          <Link href="/size-guide" className="text-[13px] font-semibold tracking-normal normal-case text-[#1f5cff] underline-offset-4 hover:underline">
            {tp("sizeGuideLink")}
          </Link>
        </legend>
        <div className="flex flex-wrap gap-2">
          {SIZES.map((option) => {
            const surcharge = sizeSurcharge(option);
            return (
              <OptionButton key={option} pressed={choice.size === option} onClick={() => onChange({ size: option })}>
                <span className="latin tabular">{option}</span>
                {surcharge > 0 ? (
                  <small className="ms-1.5 text-ink-soft">
                    <Figure>+₪{surcharge}</Figure>
                  </small>
                ) : null}
              </OptionButton>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mb-5 border-0 p-0">
        <legend className="kv-legend">{tp("nameNumber")}</legend>
        <label className="kv-opt w-full cursor-pointer items-start" data-pressed={choice.personalise}>
          <input type="checkbox" checked={choice.personalise} onChange={(e) => onChange({ personalise: e.target.checked })} className="mt-1 size-4 accent-[#1f5cff]" />
          <span>
            {tp("nameNumberToggle")}
            <small className="ms-1.5 text-ink-soft">
              <Figure>+₪{ADDONS.nameNumber}</Figure>
            </small>
          </span>
        </label>
        {choice.personalise ? (
          <input
            id={fieldId}
            type="text"
            dir="ltr"
            lang="en"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={NAME_NUMBER_MAX}
            value={choice.nameNumber}
            onChange={(e) => onChange({ nameNumber: sanitizeNameNumber(e.target.value) })}
            placeholder="BELLINGHAM 5"
            aria-label={tp("nameNumberLabel")}
            className="kv-input latin mt-3 tracking-[0.08em]"
          />
        ) : null}
      </fieldset>

      {options.length > 0 ? (
        <fieldset className="border-0 p-0">
          <legend className="kv-legend">{tp("patchLegend")}</legend>
          <p className="mb-3 text-xs text-ink-soft">
            {max === 1
              ? tp("patchHintOne", { p1: `₪${patchPrice(1)}` })
              : tp("patchHint", { p1: `₪${patchPrice(1)}`, p2: `₪${patchPrice(2)}`, p3: `₪${patchPrice(3)}` })}
          </p>
          <div className="flex flex-wrap gap-2">
            {options.map((option) => {
              const selected = choice.patches.includes(option.id);
              const disabled = max > 1 && !selected && !CHEST_PATCHES.includes(option.id) && sleevePatches(choice.patches).length >= max;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => onChange({ patches: togglePatchIn(choice.patches, option.id, max) })}
                  className={`relative flex w-[84px] flex-col items-center gap-1.5 rounded-[12px] border-[1.5px] bg-tile px-1.5 py-2 text-center transition-colors ${
                    selected ? "border-[#1f5cff] shadow-[0_0_0_1px_#1f5cff]" : disabled ? "border-rule opacity-40" : "border-rule hover:border-ink"
                  }`}
                >
                  <span className="relative block size-12 overflow-hidden rounded-md bg-tile">
                    <Image src={option.image} alt="" fill sizes="48px" className="object-cover" />
                  </span>
                  <span className="text-[11px] leading-tight text-ink-soft">{patchLabel(option.id, leagueName, tp)}</span>
                  {selected ? (
                    <span aria-hidden className="absolute end-1 top-1 grid size-5 place-items-center rounded-full bg-[#1f5cff] text-white">
                      <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8.3 6.3 11.5 13 4.5" />
                      </svg>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {choice.patches.length > 0 ? (
            <p className="mt-2 text-xs text-ink-soft">
              <Figure>{pieces}</Figure> × <Figure>+₪{patchesTotal(pieces)}</Figure>
            </p>
          ) : null}
        </fieldset>
      ) : null}
    </section>
  );
}
