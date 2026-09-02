"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ADDONS, SIZES, VERSIONS, isRetroSeason, priceFor } from "@/data/pricing";
import type { Size, Version } from "@/data/types";
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
 * Retro (2022-and-earlier `season`) has no fan/player choice — it is one
 * product, one price — so the version fieldset is hidden and every add-to-cart
 * writes "fan" as the stored version (priceFor ignores version for a retro
 * season, so this never affects what is charged).
 */
export function ProductForm({ handle, season }: { handle: string; season: string }) {
  const t = useTranslations("product");
  const tCommon = useTranslations("common");
  const { add } = useCart();
  const retro = isRetroSeason(season);

  const [size, setSize] = useState<Size>("M");
  const [version, setVersion] = useState<Version>("fan");
  const [personalise, setPersonalise] = useState(false);
  const [nameNumber, setNameNumber] = useState("");
  const [badge, setBadge] = useState(false);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const trimmedName = personalise ? sanitizeNameNumber(nameNumber).trim() : "";
  const hasName = trimmedName !== "";

  const unitPrice =
    priceFor(season, size, version) +
    (hasName ? ADDONS.nameNumber : 0) +
    (badge ? ADDONS.badge : 0);

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
      badge,
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
            const surcharge =
              priceFor(season, option, version) - priceFor(season, "S", version);
            return (
              <OptionButton
                key={option}
                pressed={size === option}
                onClick={() => setSize(option)}
              >
                <span className="latin tabular">{option}</span>
                {surcharge > 0 ? (
                  <small className="ms-1.5 text-ink-soft">{t("sizeDelta")}</small>
                ) : null}
              </OptionButton>
            );
          })}
        </div>
      </fieldset>

      {/* Version — Retro has none: one product, one price, so the choice
          would be a lie. */}
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
              className="latin w-full border border-rule bg-tile px-3.5 py-3 text-sm text-ink"
            />
            <p className="mt-2 text-xs text-ink-soft">{t("nameNumberHint")}</p>
          </div>
        ) : null}
      </fieldset>

      {/* Badge patch */}
      <fieldset className="mb-6 border-0 p-0">
        <legend className="mono-eyebrow mb-2.5 block text-ink-soft">{t("badge")}</legend>
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={badge}
            onChange={(event) => setBadge(event.target.checked)}
            className="mt-1 accent-accent"
          />
          <span>{t("badgeToggle")}</span>
        </label>
        <p className="mt-2 text-xs text-ink-soft">{t("badgeHint")}</p>
      </fieldset>

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
