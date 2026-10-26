"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ADDONS, SIZES, VERSIONS, isRetroSeason, patchesTotal, priceFor, sizeSurcharge } from "@/data/pricing";
import type { Kind, PatchId, Size, Version } from "@/data/types";
import { maxPatchesFor, patchOptionsFor } from "@/data/patches";
import { useCart, MAX_QTY } from "@/components/cart/CartProvider";
import { Figure, Price } from "@/components/shared/Money";
import { NAME_NUMBER_MAX, sanitizeNameNumber } from "@/lib/product";

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
}) {
  const t = useTranslations("product");
  const tCommon = useTranslations("common");
  const { add } = useCart();
  const retro = isRetroSeason(season);

  const patchOptions = patchOptionsFor({ league, kind, team });
  const maxPatches = maxPatchesFor({ league, kind });

  const [size, setSize] = useState<Size>("M");
  const [version, setVersion] = useState<Version>("fan");
  const [personalise, setPersonalise] = useState(false);
  const [nameNumber, setNameNumber] = useState("");
  const [patches, setPatches] = useState<PatchId[]>([]);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const trimmedName = personalise ? sanitizeNameNumber(nameNumber).trim() : "";
  const hasName = trimmedName !== "";

  const unitPrice =
    priceFor(season, size, version) +
    (hasName ? ADDONS.nameNumber : 0) +
    patchesTotal(patches.length);

  function togglePatch(id: PatchId) {
    setPatches((current) => {
      if (current.includes(id)) return current.filter((p) => p !== id);
      if (current.length >= maxPatches) return current;
      return [...current, id];
    });
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
      patches,
      qty,
      ...(hasName ? { nameNumber: trimmedName } : {}),
    });
    setAdded(true);
  }

  return (
    <div>
      <p className="mb-7 flex items-baseline gap-3 text-xl text-accent">
        <Price value={unitPrice} />
      </p>

      {/* Size */}
      <fieldset className="mb-6 border-0 p-0">
        <legend className="mono-eyebrow mb-2.5 block text-ink-soft">{t("size")}</legend>
        <div className="flex flex-wrap gap-2">
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
      </fieldset>

      {/* Version — Retro has none: one product, one price, so offering the
          choice would be a lie about what changes. */}
      {retro ? null : (
        <fieldset className="mb-6 border-0 p-0">
          <legend className="mono-eyebrow mb-2.5 block text-ink-soft">{t("version")}</legend>
          <div className="flex flex-wrap gap-2">
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

      {/* Name and number */}
      <fieldset className="mb-6 border-0 p-0">
        <legend className="mono-eyebrow mb-2.5 block text-ink-soft">
          {t("nameNumber")}
        </legend>
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={personalise}
            onChange={(event) => setPersonalise(event.target.checked)}
            className="mt-1 accent-accent"
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
              className="latin w-full border border-rule bg-field px-3.5 py-3 text-sm text-ink"
            />
            <p className="mt-2 text-xs text-ink-soft">{t("nameNumberHint")}</p>
          </div>
        ) : null}
      </fieldset>

      {/* Official patches (owner decisions 2026-10-23 through 2026-10-26):
          a small photo per eligible patch, tick as many as the cap allows
          (2 for a club shirt, 3 for a national shirt) — patchOptions is
          empty for a product that is neither, and the whole fieldset is
          skipped. */}
      {patchOptions.length > 0 ? (
        <fieldset className="mb-6 border-0 p-0">
          <legend className="mono-eyebrow mb-2.5 block text-ink-soft">
            {t("patchLegend")}
          </legend>
          <p className="mb-3 text-xs text-ink-soft">{t("patchHint")}</p>
          <div className="flex flex-wrap gap-2.5">
            {patchOptions.map((option) => {
              const selected = patches.includes(option.id);
              const disabled = !selected && patches.length >= maxPatches;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => togglePatch(option.id)}
                  className={`relative flex w-[86px] flex-col items-center gap-1.5 border px-2 py-2.5 text-center transition-colors ${
                    selected
                      ? "border-ink bg-chip"
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
                      className="absolute end-1 top-1 grid size-4 place-items-center rounded-full bg-ink text-ground"
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
              <Figure>{patches.length}</Figure>
              {" × "}
              <small className="ms-1.5">
                <Figure>+₪{patchesTotal(patches.length)}</Figure>
              </small>
            </p>
          ) : null}
          {patches.length >= maxPatches ? (
            <p className="mt-1 text-xs text-ink-soft">
              {t("patchMaxHint", { max: maxPatches })}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {/* Quantity */}
      <div className="mb-7">
        <label
          htmlFor="qty"
          className="mono-eyebrow mb-2.5 block text-ink-soft"
        >
          {t("quantity")}
        </label>
        <select
          id="qty"
          dir="ltr"
          value={qty}
          onChange={(event) => setQty(Number(event.target.value))}
          className="tabular w-24 border border-rule bg-field px-3 py-2.5 text-sm text-ink"
        >
          {Array.from({ length: MAX_QTY }, (_, index) => index + 1).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      <button type="button" onClick={onAdd} className="btn w-full wide:w-auto">
        {tCommon("addToCart")}
      </button>

      {/* aria-live so the confirmation is announced, not only seen. */}
      <p aria-live="polite" className="mt-3 min-h-6 text-sm text-ink-soft">
        {added ? (
          <>
            {t("added")}{" "}
            <Link href="/cart" className="text-ink underline underline-offset-4">
              {t("viewCart")}
            </Link>
          </>
        ) : null}
      </p>

      {/* Line total only once it differs from the unit price — otherwise it
          is the same number twice. */}
      {qty > 1 ? (
        <p className="mt-1 text-xs text-ink-soft">
          <Figure>{qty}</Figure> × <Price value={unitPrice} /> ={" "}
          <Price value={unitPrice * qty} />
        </p>
      ) : null}
    </div>
  );
}

/** option.id → its display label. A literal switch (not a dynamic t() key)
 *  so every call site stays statically checkable against the message files. */
function patchLabel(id: PatchId, leagueName: string | null, t: (key: string, values?: Record<string, string | number>) => string): string {
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
    case "champions_league":
    case "club_world_cup":
    default:
      return t("patchChampionsLeague");
  }
}

/** The mockup's `.opt` control: hairline box, chip fill when pressed. */
function OptionButton({
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
      className={`border px-4 py-2.5 text-[13px] transition-colors ${
        pressed ? "border-ink bg-chip" : "border-rule hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}
