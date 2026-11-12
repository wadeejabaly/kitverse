"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ADDONS, SIZES, SLEEVES, VERSIONS, isRetroSeason, patchPrice, patchesTotal, priceFor, sizeSurcharge } from "@/data/pricing";
import { CHEST_PATCHES, FULL_VERSION_PATCH, fullVersionPieces, patchPieces, sleevePatches, togglePatchIn } from "@/lib/patch-limits";
import type { Kind, PatchId, Size, Version } from "@/data/types";
import { maxPatchesFor, patchOptionsFor } from "@/data/patches";
import { useCart, MAX_QTY } from "@/components/cart/CartProvider";
import { Figure, Price } from "@/components/shared/Money";
import { NAME_NUMBER_MAX, sanitizeNameNumber } from "@/lib/product";
import { useProductSleeve } from "@/components/product/ProductSleeveContext";
import { SizeHelper } from "@/components/product/SizeHelper";

/**
 * The buy box.
 *
 * Every figure on screen is computed from src/data/pricing.ts as the reader
 * changes a selection — there is no price in this component's markup and none
 * in the cart item it writes. The size surcharge and the two add-ons all fall
 * out of that one source, so a price change lands here without anyone editing
 * a component.
 *
 * Retro (a 2023-and-earlier `season`) has no fan/player choice — it is one
 * product at one price — so the version fieldset is hidden and every
 * add-to-cart writes "fan" as the stored version. priceFor ignores `version`
 * for a retro season, so that stored value can never affect what is charged.
 *
 * The patch picker (owner decisions 2026-10-23 through 2026-10-26) is a
 * MULTI-select grid of small photos, one per patch the product is eligible
 * for — src/data/patches.ts's patchOptionsFor() is the single place that
 * decides which options (with which artwork) a product gets, and
 * sanitizePatches() in lib/product.ts is its server-side mirror, so the two
 * can never drift apart silently. Price is TIERED by how many are picked,
 * not by which ones: the 1st costs ADDONS.patch, the 2nd and 3rd less (see
 * patchesTotal()) — the running total is shown live so a shopper always
 * knows what adding one more costs before they tap it.
 */
export function ProductForm({
  handle,
  season,
  league,
  team,
  kind,
  leagueName,
  image,
  title,
}: {
  handle: string;
  season: string;
  /** The product's league slug ("la-liga", …) or null for a national team. */
  league: string | null;
  /** The product's team, EN — used to pick the right Champions League artwork. */
  team: string;
  kind: Kind;
  /** The shopper's-locale league name, or null for a national-team product. */
  leagueName: string | null;
  /** Photo + title for the add-to-cart confirmation (redesign phase 2). */
  image?: string;
  title?: string;
}) {
  const t = useTranslations("product");
  const tCommon = useTranslations("common");
  const { add, count: cartCount } = useCart();
  const retro = isRetroSeason(season);

  const patchOptions = patchOptionsFor({ league, kind, team, season, handle });
  const maxPatches = maxPatchesFor({ league, kind, season, handle });

  const [size, setSize] = useState<Size>("M");
  const [version, setVersion] = useState<Version>("fan");
  // Shared with <ProductGallery> via <ProductSleeveProvider> on the page, so
  // picking "Long sleeve" here can swap the photo tile too (owner decision
  // 2026-10-26) — everything else on this form stays purely local state.
  const [sleeve, setSleeve] = useProductSleeve();
  const [personalise, setPersonalise] = useState(false);
  const [nameNumber, setNameNumber] = useState("");
  const [patches, setPatches] = useState<PatchId[]>([]);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const trimmedName = personalise ? sanitizeNameNumber(nameNumber).trim() : "";
  const hasName = trimmedName !== "";

  // patches charged: the full version counts as 3 on a retro shirt, 2 on a current one
  const pieces = patchPieces(patches, retro);

  const unitPrice =
    priceFor(season, size, version, sleeve) +
    (hasName ? ADDONS.nameNumber : 0) +
    patchesTotal(pieces);

  function togglePatch(id: PatchId) {
    setPatches((current) => togglePatchIn(current, id, maxPatches));
  }

  // The confirmation is a moment, not a state: it clears itself so the page
  // does not sit there claiming something that happened a minute ago.
  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 6000);
    return () => window.clearTimeout(timer);
  }, [added]);

  function onAdd() {
    add({
      kind: "jersey",
      handle,
      size,
      version,
      sleeve,
      patches,
      qty,
      ...(hasName ? { nameNumber: trimmedName } : {}),
    });
    setAdded(true);
  }

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end gap-x-4 gap-y-1 border-b border-rule pb-6">
        <Price value={unitPrice} className="text-[2rem] leading-none font-extrabold text-ink" />
        <span className="pb-1 text-[13px] text-ink-soft">{t("priceNote")}</span>
      </div>

      {/* Size */}
      <fieldset className="mb-7 border-0 p-0">
        <legend className="kv-legend">
          <span>{t("size")}</span>
          <Link
            href="/size-guide"
            className="text-[13px] font-semibold tracking-normal normal-case text-[#1f5cff] underline-offset-4 hover:underline"
          >
            {t("sizeGuideLink")}
          </Link>
        </legend>
        <div className="flex flex-wrap gap-2.5">
          {SIZES.map((option) => {
            // 3XL and 4XL no longer add the same figure, so the delta is
            // printed from pricing.ts per size rather than being one string.
            const surcharge = sizeSurcharge(option);
            return (
              <OptionButton
                key={option}
                pressed={size === option}
                onClick={() => setSize(option)}
              >
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
        <SizeHelper initialVersion={version} onPick={setSize} />
      </fieldset>

      {/* Version — Retro has none: one product, one price, so offering the
          choice would be a lie about what changes. */}
      {retro ? null : (
        <fieldset className="mb-7 border-0 p-0">
          <legend className="kv-legend">{t("version")}</legend>
          <div className="flex flex-wrap gap-2.5">
            {VERSIONS.map((option) => (
              <OptionButton
                key={option}
                pressed={version === option}
                onClick={() => setVersion(option)}
              >
                {option === "fan" ? t("versionFan") : t("versionPlayer")}
                <small className="ms-1.5 text-ink-soft">
                  <Price value={priceFor(season, size, option)} />
                </small>
              </OptionButton>
            ))}
          </div>
        </fieldset>
      )}

      {/* Sleeve (owner decision 2026-10-26): offered on every shirt, retro
          included — unlike Version, there is no era this hides for, since
          the price list has a long-sleeve group for retro too. */}
      <fieldset className="mb-7 border-0 p-0">
        <legend className="kv-legend">{t("sleeve")}</legend>
        <div className="flex flex-wrap gap-2.5">
          {SLEEVES.map((option) => (
            <OptionButton
              key={option}
              pressed={sleeve === option}
              onClick={() => setSleeve(option)}
            >
              {option === "short" ? t("sleeveShort") : t("sleeveLong")}
              <small className="ms-1.5 text-ink-soft">
                <Price value={priceFor(season, size, version, option)} />
              </small>
            </OptionButton>
          ))}
        </div>
      </fieldset>

      {/* Name and number */}
      <fieldset className="mb-7 border-0 p-0">
        <legend className="kv-legend">{t("nameNumber")}</legend>
        <label className="kv-opt w-full cursor-pointer items-start" data-pressed={personalise}>
          <input
            type="checkbox"
            checked={personalise}
            onChange={(event) => setPersonalise(event.target.checked)}
            className="mt-1 size-4 accent-[#1f5cff]"
          />
          <span>
            {t("nameNumberToggle")}
            <small className="ms-1.5 text-ink-soft">
              <Figure>+₪{ADDONS.nameNumber}</Figure>
            </small>
          </span>
        </label>
        {personalise ? (
          <div className="mt-3">
            {/* The print is Latin: the field is forced LTR in both locales so
                the caret, the placeholder and the typed text all read the way
                the shirt will. */}
            <input
              type="text"
              dir="ltr"
              lang="en"
              inputMode="text"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={NAME_NUMBER_MAX}
              value={nameNumber}
              onChange={(event) => setNameNumber(sanitizeNameNumber(event.target.value))}
              placeholder="HAALAND 9"
              aria-label={t("nameNumberLabel")}
              className="kv-input latin tracking-[0.08em]"
            />
            <p className="mt-2 text-xs text-ink-soft">{t("nameNumberHint", { price: `₪${ADDONS.nameNumber}` })}</p>
          </div>
        ) : null}
      </fieldset>

      {/* Official patches (owner decisions 2026-10-23 through 2026-10-26):
          a small photo per eligible patch, tick as many as the cap allows
          (2 for a club shirt, 3 for a national shirt) — patchOptions is
          empty for a product that is neither, and the whole fieldset is
          skipped. */}
      {patchOptions.length > 0 ? (
        <fieldset className="mb-7 border-0 p-0">
          <legend className="kv-legend">{t("patchLegend")}</legend>
          <p className="mb-3 text-xs text-ink-soft">
            {maxPatches === 1
              ? t("patchHintOne", { p1: `₪${patchPrice(1)}` })
              : t("patchHint", { p1: `₪${patchPrice(1)}`, p2: `₪${patchPrice(2)}`, p3: `₪${patchPrice(3)}` })}
          </p>
          <div className="flex flex-wrap gap-2.5">
            {patchOptions.map((option) => {
              const selected = patches.includes(option.id);
              const disabled = maxPatches > 1 && !selected && !CHEST_PATCHES.includes(option.id) && sleevePatches(patches).length >= maxPatches && option.id !== FULL_VERSION_PATCH && !patches.includes(FULL_VERSION_PATCH as PatchId);
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => togglePatch(option.id)}
                  className={`relative flex w-[92px] flex-col items-center gap-1.5 rounded-[12px] border-[1.5px] bg-tile px-2 py-2.5 text-center transition-colors ${
                    selected
                      ? "border-[#1f5cff] shadow-[0_0_0_1px_#1f5cff]"
                      : disabled
                        ? "border-rule opacity-40"
                        : "border-rule hover:border-ink"
                  }`}
                >
                  <span className="relative block size-14 overflow-hidden rounded-md bg-tile">
                    <Image
                      src={option.image}
                      alt=""
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  </span>
                  <span className="text-[11px] leading-tight text-ink-soft">
                    {patchLabel(option.id, leagueName, t)}
                  </span>
                  {selected ? (
                    <span
                      aria-hidden
                      className="absolute end-1 top-1 grid size-5 place-items-center rounded-full bg-[#1f5cff] text-white"
                    >
                      <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8.3 6.3 11.5 13 4.5" />
                      </svg>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {patches.length > 0 ? (
            <p className="mt-3 text-xs text-ink-soft">
              <Figure>{pieces}</Figure>
              {" × "}
              <small className="ms-1.5">
                <Figure>+₪{patchesTotal(pieces)}</Figure>
              </small>
            </p>
          ) : null}
          {patches.includes(FULL_VERSION_PATCH as PatchId) ? (
            <p className="mt-1 text-xs text-ink-soft">{t("patchFullHint", { count: fullVersionPieces(retro) })}</p>
          ) : null}
          {maxPatches > 1 && sleevePatches(patches).length >= maxPatches && !patches.includes(FULL_VERSION_PATCH as PatchId) ? (
            <p className="mt-1 text-xs text-ink-soft">
              {t("patchMaxHint", { max: maxPatches })}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {/* Quantity + add to cart (redesign phase 2): a −/+ stepper instead of
          a select, and the button full width beside it. */}
      <div className="flex items-stretch gap-3">
        <div className="flex shrink-0 items-center rounded-[10px] border-[1.5px] border-rule bg-tile" dir="ltr">
          <button
            type="button"
            aria-label={t("qtyLess")}
            disabled={qty <= 1}
            onClick={() => setQty((value) => Math.max(1, value - 1))}
            className="grid size-12 place-items-center text-lg text-ink disabled:opacity-30"
          >
            −
          </button>
          <span aria-live="polite" aria-label={t("quantity")} className="tabular w-7 text-center font-bold">
            {qty}
          </span>
          <button
            type="button"
            aria-label={t("qtyMore")}
            disabled={qty >= MAX_QTY}
            onClick={() => setQty((value) => Math.min(MAX_QTY, value + 1))}
            className="grid size-12 place-items-center text-lg text-ink disabled:opacity-30"
          >
            +
          </button>
        </div>
        <button type="button" onClick={onAdd} className="btn grow">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M3.2 5.5h9.6l-.8 8.3H4z" strokeLinejoin="round" />
            <path d="M6 7.2V4.8a2 2 0 0 1 4 0v2.4" strokeLinecap="round" />
          </svg>
          {tCommon("addToCart")}
        </button>
      </div>

      {/* The confirmation: a toast with the shirt, what was chosen and the
          way on, announced politely. The header count updates on its own —
          it reads the same cart provider. */}
      <div aria-live="polite">
        {added ? (
          <div className="kv-toast" role="status">
            <div className="flex items-start gap-3">
              {image ? (
                <span className="relative block size-16 shrink-0 overflow-hidden rounded-[10px] bg-white">
                  <Image src={image} alt="" fill sizes="64px" className="object-contain p-1" />
                </span>
              ) : null}
              <div className="min-w-0 grow">
                <p className="flex items-center gap-2 text-[14px] font-bold text-white">
                  <span className="grid size-5 place-items-center rounded-full bg-[#1f5cff]">
                    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8.3 6.3 11.5 13 4.5" />
                    </svg>
                  </span>
                  {t("added")}
                </p>
                {title ? <p className="mt-1 truncate text-[13px] text-white/80">{title}</p> : null}
                <p className="mt-0.5 text-[12px] text-white/60">
                  <span className="latin">{size}</span> · {retro ? t("retroBadge") : version === "fan" ? t("versionFan") : t("versionPlayer")} ·{" "}
                  <Figure>{qty}</Figure> × <Price value={unitPrice} />
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdded(false)}
                aria-label={tCommon("close")}
                className="grid size-7 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3 3l10 10M13 3 3 13" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link href="/cart" className="rounded-[8px] border border-white/20 px-3 py-2.5 text-center text-[13px] font-semibold text-white hover:bg-white/10">
                {t("viewCart")} (<Figure>{cartCount}</Figure>)
              </Link>
              <Link href="/checkout" className="rounded-[8px] bg-[#1f5cff] px-3 py-2.5 text-center text-[13px] font-bold text-white hover:bg-[#3a72ff]">
                {tCommon("checkout")}
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      {/* Line total only once it differs from the unit price — otherwise it
          is the same number twice. */}
      {qty > 1 ? (
        <p className="mt-3 text-[13px] text-ink-soft">
          <Figure>{qty}</Figure> × <Price value={unitPrice} /> ={" "}
          <Price value={unitPrice * qty} />
        </p>
      ) : null}
    </div>
  );
}

/** option.id → its display label. A literal switch (not a dynamic t() key)
 *  so every call site stays statically checkable against the message files. */
export function patchLabel(id: PatchId, leagueName: string | null, t: (key: string, values?: Record<string, string | number>) => string): string {
  switch (id) {
    case "league":
      return t("patchLeague", { league: leagueName ?? "" });
    case "europa_league":
      return t("patchEuropaLeague");
    case "coppa_italia":
      return t("patchCoppaItalia");
    case "world_cup":
      return t("patchWorldCup");
    case "world_cup_champions":
      return t("patchWorldCupChampions");
    case "world_cup_peace":
      return t("patchWorldCupPeace");
    case "club_world_cup":
      return t("patchClubWorldChampions");
    case "ucl_final_print":
      return t("patchFinalPrint");
    case "ucl_titles_badge":
      return t("patchUclTitlesBadge");
    case "ucl_respect":
      return t("patchUclRespect");
    case "champions_league_full":
      return t("patchChampionsLeagueFull");
    case "champions_league":
    default:
      return t("patchChampionsLeague");
  }
}

/** The mockup's `.opt` control: hairline box, chip fill when pressed. */
export function OptionButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="kv-opt"
    >
      {children}
    </button>
  );
}
