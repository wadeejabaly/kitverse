"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCart, MAX_QTY } from "@/components/cart/CartProvider";
import { Figure, Price } from "@/components/shared/Money";

/**
 * The accessory buy box — the keychain-shaped sibling of <ProductForm/>.
 * Deliberately much shorter: an accessory has one flat price and nothing to
 * configure (no size, no version, no patch), so the only control is how
 * many. Same confirmation pattern as the jersey form (a self-clearing
 * "Added ✓" message with a link to the cart) so the two buy boxes feel like
 * one system even though this one has far less in it.
 */
export function AccessoryForm({
  handle,
  price,
}: {
  handle: string;
  price: number;
}) {
  const t = useTranslations("accessories");
  const tCommon = useTranslations("common");
  const { add } = useCart();

  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 6000);
    return () => window.clearTimeout(timer);
  }, [added]);

  function onAdd() {
    add({ kind: "accessory", handle, qty });
    setAdded(true);
  }

  return (
    <div>
      <p className="mb-7 flex items-baseline gap-3 text-xl text-accent">
        <Price value={price} />
      </p>

      <div className="mb-7">
        <label htmlFor="accessory-qty" className="mono-eyebrow mb-2.5 block text-ink-soft">
          {t("quantity")}
        </label>
        <select
          id="accessory-qty"
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

      {qty > 1 ? (
        <p className="mt-1 text-xs text-ink-soft">
          <Figure>{qty}</Figure> × <Price value={price} /> = <Price value={price * qty} />
        </p>
      ) : null}
    </div>
  );
}
