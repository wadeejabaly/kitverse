import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getVisibleProducts } from "@/data/catalog";
import type { CartProductInfo } from "@/components/cart/CartView";
import { CheckoutView } from "@/components/checkout/CheckoutView";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { alternatesFor } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: alternatesFor(locale, "/checkout"),
    // A payment form is nobody's search result. Absent from the sitemap too.
    robots: { index: false, follow: false },
  };
}

/**
 * Checkout. The page is static: cart lines live in the visitor's browser and the server only
 * contributes the catalogue facts a line needs to render. Placing an order goes to
 * /api/checkout/cash/start, which re-prices everything with the shared pricing engine.
 * Cash on delivery only for now; online payment is added on the backend later.
 */
export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("checkout");

  const products: CartProductInfo[] = getVisibleProducts().map((product) => ({
    handle: product.handle,
    title: product.title,
    titleAr: product.titleAr,
    season: product.season,
    image: product.image,
  }));


  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />
      {/* CheckoutView reads `?pay=` (how the hosted card page sends a buyer
          back after a failure or a cancellation) with useSearchParams, which
          needs a boundary or the build fails. The fallback matches the
          component's own pre-hydration state, so nothing shifts. */}
      <Suspense fallback={<div className="min-h-[40vh]" aria-hidden />}>
        <CheckoutView
          products={products}
          locale={locale}
          cashEnabled={!!process.env.SUPABASE_SERVICE_ROLE_KEY}
        />
      </Suspense>
    </Wrap>
  );
}
