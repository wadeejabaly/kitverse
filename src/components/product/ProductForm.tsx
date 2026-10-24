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
 * The patch fieldset (owner decision 2026-10-23, replacing the old generic
 * "badge" checkbox) only exists on a CLUB product — `leagueName` is null for
 * a national team, and the whole fieldset is skipped, so a national shirt
 * never offers (and can never be billed for) a patch at all.
 */
export function ProductForm({
  handle,
  season,
  leagueName,
}: {
  handle: string;
  season: string;
  /** The shopper's-locale league name, or null for a national-team product. */
  leagueName: string | null;
}) {
  const t = useTranslations("product");
  const tCommon = useTranslations("common");
  const { add } = useCart();
  const retro = isRetroSeason(season);

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
          <span>{t("nameNumberToggle")}</span>
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

      {/* Official patch (owner decision 2026-10-23) — a national-team product
          has no leagueName and skips this fieldset entirely: there is no
          league patch to offer and no Champions League patch either, since
          the feature is scoped to club shirts. One patch per shirt, never
          both: this is a radio group, not two checkboxes. */}
      {leagueName ? (
        <fieldset className="mb-6 border-0 p-0">
          <legend className="mono-eyebrow mb-2.5 block text-ink-soft">
            {t("patchLegend")}
          </legend>
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-start gap-2.5">
              <input
                type="radio"
                name="patch"
                checked={patch === "none"}
                onChange={() => setPatch("none")}
                className="mt-1 accent-accent"
              />
              <span>{t("patchNone")}</span>
            </label>
            <label className="flex items-start gap-2.5">
              <input
                type="radio"
                name="patch"
                checked={patch === "league"}
                onChange={() => setPatch("league")}
                className="mt-1 accent-accent"
              />
              <span>{t("patchLeague", { league: leagueName })}</span>
            </label>
            <label className="flex items-start gap-2.5">
              <input
                type="radio"
                name="patch"
                checked={patch === "ucl"}
                onChange={() => setPatch("ucl")}
                className="mt-1 accent-accent"
              />
              <span>{t("patchUcl")}</span>
            </label>
          </div>
          <p className="mt-2 text-xs text-ink-soft">{t("patchHint")}</p>
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
