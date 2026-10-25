"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cartTotals, priceLine, round2 } from "@/data/pricing";
import { lineKey, useCart, MAX_QTY } from "@/components/cart/CartProvider";
import { Figure, Price } from "@/components/shared/Money";

/** The catalogue facts a jersey cart line needs, passed down from the server page. */
export interface CartProductInfo {
  handle: string;
  title: string;
  titleAr: string;
  season: string;
  image: string;
}

/**
 * The accessory-catalogue facts an accessory cart line needs (2026-10-25,
 * the Accessories/keychains ask) — the same idea as `CartProductInfo`, one
 * level simpler: no `season`, since an accessory's price doesn't depend on
 * one.
 */
export interface CartAccessoryInfo {
  handle: string;
  team: string;
  teamAr: string;
  price: number;
  image: string;
}

/**
 * The cart.
 *
 * Nothing about money is stored: each jersey line's price is recomputed here
 * from the product's `season` plus the options on the line, through the same
 * priceLine() the server will use when the order is written; each accessory
 * line's price is just its flat catalogue price × qty. A line whose handle is
 * no longer in the approved catalogue is skipped entirely — it cannot be
 * priced honestly, so it is not shown and not charged for.
 *
 * Shipping is NOT shown as a figure here: it depends on the delivery region,
 * which this page does not collect (checkout does). Printing a number would
 * either be wrong for most shoppers or force a region choice before they have
 * started on an address — so the cart totals the basket and says where the
 * rate comes from instead.
 */
export function CartView({
  products,
  accessories,
  locale,
}: {
  products: CartProductInfo[];
  accessories: CartAccessoryInfo[];
  locale: string;
}) {
  const t = useTranslations("cart");
  const tCommon = useTranslations("common");
  const tProduct = useTranslations("product");
  const tAccessories = useTranslations("accessories");
  const { items, hydrated, remove, updateQty } = useCart();

  const byHandle = new Map(products.map((product) => [product.handle, product]));
  const byAccessoryHandle = new Map(accessories.map((accessory) => [accessory.handle, accessory]));

  const lines = items
    .filter((item) => item.kind === "jersey")
    .map((item) => {
      const product = byHandle.get(item.handle);
      if (!product) return null;
      const priced = priceLine(product.season, item.size, item.version, item.qty, {
        nameNumber: Boolean(item.nameNumber),
        patch: item.patch,
      });
      return { item, product, priced, key: lineKey(item) };
    })
    .filter((line) => line !== null);

  // Accessory lines (2026-10-25): one flat price, no options — the "priced"
  // shape still matches PricedLine so cartTotals() can sum both kinds at once.
  const accessoryLines = items
    .filter((item) => item.kind === "accessory")
    .map((item) => {
      const accessory = byAccessoryHandle.get(item.handle);
      if (!accessory) return null;
      const priced = {
        unitPrice: accessory.price,
        qty: item.qty,
        lineTotal: round2(accessory.price * item.qty),
      };
      return { item, accessory, priced, key: lineKey(item) };
    })
    .filter((line) => line !== null);

  const totals = cartTotals([
    ...lines.map((line) => line.priced),
    ...accessoryLines.map((line) => line.priced),
  ]);

  // Pre-hydration the cart is unknowable, so reserve the space rather than
  // rendering an "empty cart" that may be about to contradict itself.
  if (!hydrated) {
    return <div className="min-h-[40vh]" aria-hidden />;
  }

  if (lines.length === 0 && accessoryLines.length === 0) {
    return (
      <div className="py-16">
        <h2 className="mb-2.5 text-xl">{t("emptyTitle")}</h2>
        <p className="mb-7 max-w-[46ch] text-ink-soft">{t("emptyBody")}</p>
        <Link href="/shop" className="btn">
          {tCommon("continueShopping")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <section className="pt-8">
        {lines.map(({ item, product, priced, key }) => (
          <div
            key={key}
            className="grid grid-cols-[110px_1fr] items-start gap-5 border-b border-rule py-6 wide:grid-cols-[110px_1fr_auto]"
          >
            <Link
              href={`/product/${product.handle}`}
              className="grid aspect-square place-items-center bg-tile"
            >
              <Image
                src={product.image}
                alt={locale === "ar" ? product.titleAr : product.title}
                width={220}
                height={220}
                sizes="110px"
                className="h-auto w-[86%]"
              />
            </Link>

            <div>
              <h2 className="mb-1 text-[15px] font-normal">
                <Link href={`/product/${product.handle}`}>
                  {locale === "ar" ? product.titleAr : product.title}
                </Link>
              </h2>

              <dl className="text-[13px] text-ink-soft">
                <Prop label={t("propSize")}>
                  <span className="latin tabular">{item.size}</span>
                </Prop>
                <Prop label={t("propVersion")}>
                  {item.version === "fan"
                    ? tProduct("versionFan")
                    : tProduct("versionPlayer")}
                </Prop>
                {item.nameNumber ? (
                  <Prop label={t("propNameNumber")}>
                    <bdi dir="ltr" className="latin">
                      {item.nameNumber}
                    </bdi>
                  </Prop>
                ) : null}
                {item.patch !== "none" ? (
                  <Prop label={t("propPatch")}>
                    {item.patch === "ucl"
                      ? t("propPatchUcl")
                      : item.patch === "worldcup"
                        ? t("propPatchWorldCup")
                        : t("propPatchLeague")}
                  </Prop>
                ) : null}
              </dl>

              <div className="mt-3 flex items-center gap-4">
                <div className="flex items-center border border-rule">
                  <StepperButton
                    label={t("decrease")}
                    disabled={item.qty <= 1}
                    onClick={() => updateQty(key, item.qty - 1)}
                  >
                    –
                  </StepperButton>
                  <span className="tabular w-9 text-center text-sm" aria-live="polite">
                    <Figure>{item.qty}</Figure>
                  </span>
                  <StepperButton
                    label={t("increase")}
                    disabled={item.qty >= MAX_QTY}
                    onClick={() => updateQty(key, item.qty + 1)}
                  >
                    +
                  </StepperButton>
                </div>
                <button
                  type="button"
                  onClick={() => remove(key)}
                  className="text-[13px] text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
                >
                  {tCommon("remove")}
                </button>
              </div>
            </div>

            <span className="col-span-2 text-accent wide:col-span-1 wide:text-end">
              <Price value={priced.lineTotal} />
            </span>
          </div>
        ))}
      </section>

      {/* Accessory lines (2026-10-25): same row shape as a jersey line, minus
          the size/version/patch metadata list — a keychain has none of
          those, so the <dl> is skipped entirely rather than shown empty. */}
      {accessoryLines.length > 0 ? (
        <section className="pt-2">
          <h2 className="mono-eyebrow mb-1 pt-6 text-ink-soft">
            {tAccessories("eyebrow")}
          </h2>
          {accessoryLines.map(({ item, accessory, priced, key }) => (
            <div
              key={key}
              className="grid grid-cols-[110px_1fr] items-start gap-5 border-b border-rule py-6 wide:grid-cols-[110px_1fr_auto]"
            >
              <Link
                href={`/accessories/keychains/${accessory.handle.replace(/^keychain-/, "")}`}
                className="grid aspect-square place-items-center bg-tile"
              >
                <Image
                  src={accessory.image}
                  alt={locale === "ar" ? accessory.teamAr : accessory.team}
                  width={220}
                  height={220}
                  sizes="110px"
                  className="h-auto w-[86%]"
                />
              </Link>

              <div>
                <h3 className="mb-1 text-[15px] font-normal">
                  <Link href={`/accessories/keychains/${accessory.handle.replace(/^keychain-/, "")}`}>
                    {tAccessories("keychainTitle", {
                      team: locale === "ar" ? accessory.teamAr : accessory.team,
                    })}
                  </Link>
                </h3>

                <div className="mt-3 flex items-center gap-4">
                  <div className="flex items-center border border-rule">
                    <StepperButton
                      label={t("decrease")}
                      disabled={item.qty <= 1}
                      onClick={() => updateQty(key, item.qty - 1)}
                    >
                      –
                    </StepperButton>
                    <span className="tabular w-9 text-center text-sm" aria-live="polite">
                      <Figure>{item.qty}</Figure>
                    </span>
                    <StepperButton
                      label={t("increase")}
                      disabled={item.qty >= MAX_QTY}
                      onClick={() => updateQty(key, item.qty + 1)}
                    >
                      +
                    </StepperButton>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(key)}
                    className="text-[13px] text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
                  >
                    {tCommon("remove")}
                  </button>
                </div>
              </div>

              <span className="col-span-2 text-accent wide:col-span-1 wide:text-end">
                <Price value={priced.lineTotal} />
              </span>
            </div>
          ))}
        </section>
      ) : null}

      {/* Totals sit at the inline end — margin-inline-start:auto in the
          mockup, which mirrors correctly in Arabic without a second rule. */}
      <div className="flex max-w-[340px] flex-col gap-2.5 pt-6 pb-10 ms-auto">
        <Row label={t("shipping")}>
          <span className="text-ink-soft">{t("shippingTbd")}</span>
        </Row>
        <p className="text-xs text-ink-soft">{t("shippingNote")}</p>
        <div className="flex justify-between border-t border-rule pt-3 text-[17px]">
          <span>{t("subtotal")}</span>
          <Price value={totals.subtotal} />
        </div>

        {/* /checkout arrives in the next wave; the link is live now so the
            path through the store is complete and testable. */}
        <Link href="/checkout" className="btn mt-2.5">
          {tCommon("checkout")}
        </Link>
        <Link
          href="/shop"
          className="text-center text-[13px] text-ink-soft transition-colors hover:text-ink"
        >
          {tCommon("continueShopping")}
        </Link>
        <p className="mt-1 text-xs text-ink-soft">{t("deliveryNote")}</p>
      </div>
    </>
  );
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt>{label}:</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span>{label}</span>
      {children}
    </div>
  );
}

function StepperButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-8 w-8 text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}
