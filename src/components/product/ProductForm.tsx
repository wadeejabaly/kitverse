"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ADDONS, SIZES, VERSIONS, isRetroSeason, priceFor, sizeSurcharge } from "@/data/pricing";
import type { Patch, Size, Version } from "@/data/types";
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
 * The patch fieldset (owner decision 2026-10-23, extended 2026-10-25 with a
 * World Cup patch) offers a different set depending on the product: a CLUB
 * product (`leagueName` set) offers its own league's patch or the Champions
 * League patch; a NATIONAL-TEAM product (`isNational`) offers only the World
 * Cup patch; anything else (should not happen in this catalogue) gets no
 * patch fieldset at all. `patchOptions` below is the single place that
 * decides which set a product gets — sanitizePatch() in lib/product.ts is
 * its server-side mirror, so the two can never drift apart silently.
 */
export function ProductForm({
  handle,
  season,
  leagueName,
  isNational,
}: {
  handle: string;
  season: string;
  /** The shopper's-locale league name, or null for a national-team product. */
  leagueName: string | null;
  /** True for a national-team product — offers the World Cup patch instead. */
  isNational: boolean;
}) {
  const t = useTranslations("product");
  const tCommon = useTranslations("common");
  const { add } = useCart();
  const retro = isRetroSeason(season);

  const patchOptions: { value: Patch; label: string }[] = leagueName
    ? [
        { value: "league", label: t("patchLeague", { league: leagueName }) },
        { value: "ucl", label: t("patchUcl") },
      ]
    : isNational
      ? [{ value: "worldcup", label: t("patchWorldCup") }]
      : [];

  const [size, setSize] = useState<Size>("M");
  const [version, setVersion] = useState<Version>("fan");
  const [personalise, setPersonalise] = useState(false);
  const [nameNumber, setNameNumber] = useState("");
  const [patch, setPatch] = useState<Patch>("none");
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const trimmedName = personalise ? sanitizeNameNumber(nameNumber).trim() : "";
  const hasName = trimmedName !== "";

  const unitPrice =
    priceFor(season, size, version) +
    (hasName ? ADDONS.nameNumber : 0) +
    (patch !== "none" ? ADDONS.patch : 0);

  // The confirmation is a moment, not a state: it clears itself so the page
  // does not sit there claiming something that happened a minute ago.
  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 6000);
    return () => window.clearTimeout(timer);
  }, [added]);

  function onAdd() {
    add({
      handle,
      size,
      version,
      patch,
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
              className="latin w-full border border-rule bg-tile px-3.5 py-3 text-sm text-ink"
            />
            <p className="mt-2 text-xs text-ink-soft">{t("nameNumberHint")}</p>
          </div>
        ) : null}
      </fieldset>

      {/* Official patch (owner decision 2026-10-23; checkbox + dropdown per
          owner request 2026-10-24; World Cup patch for national teams per
          owner request 2026-10-25) — patchOptions is empty for a product
          that is neither a club shirt nor a national-team shirt, and the
          whole fieldset is skipped. Checking the box reveals the choice (a
          dropdown when there is more than one, otherwise just the single
          option's name — a one-item dropdown would be pointless UI); one
          patch per shirt, never both, so unchecking the box is the only way
          back to "none". */}
      {patchOptions.length > 0 ? (
        <fieldset className="mb-6 border-0 p-0">
          <legend className="mono-eyebrow mb-2.5 block text-ink-soft">
            {t("patchLegend")}
          </legend>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={patch !== "none"}
              onChange={(event) =>
                setPatch(event.target.checked ? patchOptions[0].value : "none")
              }
              className="mt-1 accent-accent"
            />
            <span>{t("patchToggle")}</span>
          </label>
          {patch !== "none" ? (
            <div className="mt-3">
              {patchOptions.length > 1 ? (
                <select
                  value={patch}
                  onChange={(event) => setPatch(event.target.value as Patch)}
                  aria-label={t("patchSelectLabel")}
                  className="w-full border border-rule bg-tile px-3.5 py-3 text-sm text-ink"
                >
                  {patchOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm">{patchOptions[0].label}</p>
              )}
              <p className="mt-2 text-xs text-ink-soft">{t("patchHint")}</p>
            </div>
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
          className="tabular w-24 border border-rule bg-tile px-3 py-2.5 text-sm text-ink"
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
