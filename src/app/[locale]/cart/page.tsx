import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getVisibleProducts } from "@/data/catalog";
import { getOrderableAccessories } from "@/data/accessories";
import { CartView, type CartAccessoryInfo, type CartProductInfo } from "@/components/cart/CartView";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { alternatesFor } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cart" });
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: alternatesFor(locale, "/cart"),
    // A personal, per-browser page — nothing here belongs in an index.
    robots: { index: false, follow: true },
  };
}

/**
 * Cart. The page is static: the lines live in the visitor's browser, so all
 * the server contributes is the catalogue facts a line needs to render and
 * price itself. Only approved products are sent — an unapproved handle in a
 * stale localStorage cart is dropped rather than quietly sold.
 */
export default async function CartPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("cart");

  const products: CartProductInfo[] = getVisibleProducts().filter((product) => product.inStock !== false).map((product) => ({
    handle: product.handle,
    title: product.title,
    titleAr: product.titleAr,
    titleHe: product.titleHe,
    season: product.season,
    image: product.image,
  }));

  const accessories: CartAccessoryInfo[] = getOrderableAccessories().map((accessory) => ({
    handle: accessory.handle,
    category: accessory.category,
    variant: accessory.variant,
    variantAr: accessory.variantAr,
    variantHe: accessory.variantHe,
    team: accessory.team,
    teamAr: accessory.teamAr,
    teamHe: accessory.teamHe,
    price: accessory.price,
    image: accessory.image,
  }));

  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("title")} />
      <CartView products={products} accessories={accessories} locale={locale} />
    </Wrap>
  );
}
