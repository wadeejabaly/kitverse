import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getVisibleProducts } from "@/data/catalog";
import { CartView, type CartProductInfo } from "@/components/cart/CartView";
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

  const products: CartProductInfo[] = getVisibleProducts().map((product) => ({
    handle: product.handle,
    title: product.title,
    titleAr: product.titleAr,
    season: product.season,
    image: product.image,
    kind: product.kind,
  }));

  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("title")} />
      <CartView products={products} locale={locale} />
    </Wrap>
  );
}
