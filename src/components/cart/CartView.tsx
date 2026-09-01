"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SHIPPING_ILS_DOMESTIC, cartTotals, priceLine } from "@/data/pricing";
import type { Kind } from "@/data/types";
import { lineKey, useCart, MAX_QTY } from "@/components/cart/CartProvider";
import { Figure, Price } from "@/components/shared/Money";

/** The catalogue facts a cart line needs, passed down from the server page. */
export interface CartProductInfo {
  handle: string;
  title: string;
  titleAr: string;
  season: string;
  image: string;
  kind: Kind;
}

/**
 * The cart.
 *
 * Nothing about money is stored: each line's price is recomputed here from the
 * product's `kind` plus the options on the line, through the same priceLine()
 * the server will use when the order is written. A line whose handle is no
 * longer in the approved catalogue is skipped entirely — it cannot be priced
 * honestly, so it is not shown and not charged for.
 */
export function CartView({
  products,
  locale,
}: {
  products: CartProductInfo[];
  locale: string;
}) {
  const t = useTranslations("cart");
  const tCommon = useTranslations("common");
  const tProduct = useTranslations("product");
  const { items, hydrated, remove, updateQty } = useCart();

  const byHandle = new Map(products.map((product) => [product.handle, product]));

  const lines = items
    .map((item) => {
      const product = byHandle.get(item.handle);
      if (!product) return null;
      const priced = priceLine(product.kind, item.size, item.version, item.qty, {
        nameNumber: Boolean(item.nameNumber),
        badge: item.badge,
      });
      return { item, product, priced, key: lineKey(item) };
    })
    .filter((line) => line !== null);

  const totals = cartTotals(lines.map((line) => line.priced));

  // Pre-hydration the cart is unknowable, so reserve the space rather than
  // rendering an "empty cart" that may be about to contradict itself.
  if (!hydrated) {
    return <div className="min-h-[40vh]" aria-hidden />;
  }

  if (lines.length === 0) {
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
                {item.badge ? (
                  <Prop label={t("propBadge")}>{t("propBadgeYes")}</Prop>
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

      {/* Totals sit at the inline end — margin-inline-start:auto in the
          mockup, which mirrors correctly in Arabic without a second rule. */}
      <div className="flex max-w-[340px] flex-col gap-2.5 pt-6 pb-10 ms-auto">
        <Row label={t("subtotal")}>
          <Price value={totals.subtotal} />
        </Row>
        <Row label={t("shipping")}>
          <span className="flex items-baseline gap-2">
            <span className="text-ink-soft">{t("shippingLabel")}</span>
            <Price value={SHIPPING_ILS_DOMESTIC} />
          </span>
        </Row>
        <p className="text-xs text-ink-soft">{t("shippingNote")}</p>
        <div className="flex justify-between border-t border-rule pt-3 text-[17px]">
          <span>{t("total")}</span>
          <Price value={totals.total} />
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
