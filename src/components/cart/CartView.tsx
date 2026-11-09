"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cartTotals, priceLine, round2 } from "@/data/pricing";
import { PATCH_PROP_KEYS } from "@/data/patches";
import { lineKey, useCart, MAX_QTY } from "@/components/cart/CartProvider";
import { Figure, Price } from "@/components/shared/Money";

/** The catalogue facts a jersey cart line needs, passed down from the server page. */
export interface CartProductInfo {
  handle: string;
  title: string;
  titleAr: string;
  titleHe?: string;
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
  teamHe?: string;
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
  const titleFor = (product: CartProductInfo, lang: string) =>
    lang === "ar" ? product.titleAr : lang === "he" && product.titleHe ? product.titleHe : product.title;
  const teamName = (accessory: CartAccessoryInfo) =>
    locale === "ar" ? accessory.teamAr : locale === "he" && accessory.teamHe ? accessory.teamHe : accessory.team;

  const byHandle = new Map(products.map((product) => [product.handle, product]));
  const byAccessoryHandle = new Map(accessories.map((accessory) => [accessory.handle, accessory]));

  const lines = items
    .filter((item) => item.kind === "jersey")
    .map((item) => {
      const product = byHandle.get(item.handle);
      if (!product) return null;
      const priced = priceLine(product.season, item.size, item.version, item.qty, {
        nameNumber: Boolean(item.nameNumber),
        patchCount: item.patches.length,
        sleeve: item.sleeve,
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
      <div className="py-12 wide:py-16">
        <div className="kv-panel mx-auto max-w-xl px-6 py-12 text-center">
          <span className="kv-icon-tile mx-auto mb-5 !size-14 !rounded-full">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M3.2 5.5h9.6l-.8 8.3H4z" strokeLinejoin="round" />
              <path d="M6 7.2V4.8a2 2 0 0 1 4 0v2.4" strokeLinecap="round" />
            </svg>
          </span>
          <h2 className="kv-section-title mb-2.5">{t("emptyTitle")}</h2>
          <p className="mx-auto mb-7 max-w-[46ch] text-ink-soft">{t("emptyBody")}</p>
          <Link href="/shop" className="btn">
            {tCommon("continueShopping")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-6 py-8 wide:grid-cols-[1fr_360px] wide:gap-10 wide:py-12">
    <div className="kv-panel px-4 sm:px-6">
      <section>
        {lines.map(({ item, product, priced, key }) => (
          <div
            key={key}
            className="grid grid-cols-[88px_1fr] items-start gap-4 border-b border-rule py-5 last:border-b-0 sm:grid-cols-[110px_1fr_auto] sm:gap-5"
          >
            <Link
              href={`/product/${product.handle}`}
              className="grid aspect-square place-items-center overflow-hidden rounded-[12px] bg-[#f1f3f7]"
            >
              <Image
                src={product.image}
                alt={titleFor(product, locale)}
                width={220}
                height={220}
                sizes="110px"
                className="aspect-square h-auto w-full object-contain"
              />
            </Link>

            <div>
              <h2 className="mb-1.5 text-[15px] leading-snug font-bold">
                <Link href={`/product/${product.handle}`} className="hover:text-[#1f5cff]">
                  {titleFor(product, locale)}
                </Link>
              </h2>

              <dl className="flex flex-wrap gap-1.5 text-[12.5px] text-ink-soft">
                <Prop label={t("propSize")}>
                  <span className="latin tabular">{item.size}</span>
                </Prop>
                <Prop label={t("propVersion")}>
                  {item.version === "fan"
                    ? tProduct("versionFan")
                    : tProduct("versionPlayer")}
                </Prop>
                <Prop label={t("propSleeve")}>
                  {item.sleeve === "long"
                    ? tProduct("sleeveLong")
                    : tProduct("sleeveShort")}
                </Prop>
                {item.nameNumber ? (
                  <Prop label={t("propNameNumber")}>
                    <bdi dir="ltr" className="latin">
                      {item.nameNumber}
                    </bdi>
                  </Prop>
                ) : null}
                {item.patches.length > 0 ? (
                  <Prop label={t("propPatch")}>
                    {item.patches.map((p) => t(PATCH_PROP_KEYS[p])).join(" + ")}
                  </Prop>
                ) : null}
              </dl>

              <div className="mt-3 flex items-center gap-4">
                <div className="flex items-center rounded-[8px] border-[1.5px] border-rule bg-tile" dir="ltr">
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
                  className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft transition-colors hover:text-[#c0392b]"
                >
                  {tCommon("remove")}
                </button>
              </div>
            </div>

            <span className="col-span-2 text-[16px] font-extrabold text-ink sm:col-span-1 sm:text-end">
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
          <h2 className="kv-filter-head mb-0 border-t border-rule pt-5">
            {tAccessories("eyebrow")}
          </h2>
          {accessoryLines.map(({ item, accessory, priced, key }) => (
            <div
              key={key}
              className="grid grid-cols-[88px_1fr] items-start gap-4 border-b border-rule py-5 last:border-b-0 sm:grid-cols-[110px_1fr_auto] sm:gap-5"
            >
              <Link
                href={`/accessories/keychains/${accessory.handle.replace(/^keychain-/, "")}`}
                className="grid aspect-square place-items-center overflow-hidden rounded-[12px] bg-[#f1f3f7]"
              >
                <Image
                  src={accessory.image}
                  alt={teamName(accessory)}
                  width={220}
                  height={220}
                  sizes="110px"
                  className="h-auto w-[86%] mix-blend-multiply"
                />
              </Link>

              <div>
                <h3 className="mb-1 text-[15px] font-bold">
                  <Link href={`/accessories/keychains/${accessory.handle.replace(/^keychain-/, "")}`}>
                    {tAccessories("keychainTitle", {
                      team: teamName(accessory),
                    })}
                  </Link>
                </h3>

                <div className="mt-3 flex items-center gap-4">
                  <div className="flex items-center rounded-[8px] border-[1.5px] border-rule bg-tile" dir="ltr">
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
                    className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft transition-colors hover:text-[#c0392b]"
                  >
                    {tCommon("remove")}
                  </button>
                </div>
              </div>

              <span className="col-span-2 text-[16px] font-extrabold text-ink sm:col-span-1 sm:text-end">
                <Price value={priced.lineTotal} />
              </span>
            </div>
          ))}
        </section>
      ) : null}

    </div>

      {/* The summary card (redesign phase 2): sticky beside the lines on a
          desktop, under them on a phone. Same numbers as before — the
          subtotal from the pricing engine; delivery depends on the area,
          which is chosen at checkout. */}
      <aside className="kv-panel flex flex-col gap-3 p-6 wide:sticky wide:top-28">
        <h2 className="kv-filter-head mb-1">{t("summaryTitle")}</h2>
        <Row label={t("shipping")}>
          <span className="text-ink-soft">{t("shippingTbd")}</span>
        </Row>
        <p className="text-[12.5px] text-ink-soft">{t("shippingNote")}</p>
        <div className="flex items-baseline justify-between border-t border-rule pt-4">
          <span className="font-bold">{t("subtotal")}</span>
          <Price value={totals.subtotal} className="text-[1.6rem] leading-none font-extrabold" />
        </div>

        <Link href="/checkout" className="btn mt-2 w-full">
          {tCommon("checkout")}
          <span aria-hidden className="btn-flood-arrow">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </Link>
        <Link
          href="/shop"
          className="text-center text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
        >
          {tCommon("continueShopping")}
        </Link>
        <p className="mt-1 border-t border-rule pt-3 text-[12.5px] text-ink-soft">{t("deliveryNote")}</p>
      </aside>
    </div>
  );
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1 rounded-full bg-chip px-2.5 py-0.5">
      <dt>{label}:</dt>
      <dd className="font-semibold text-ink">{children}</dd>
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
      className="grid h-9 w-9 place-items-center text-ink transition-colors hover:text-[#1f5cff] disabled:opacity-30"
    >
      {children}
    </button>
  );
}
