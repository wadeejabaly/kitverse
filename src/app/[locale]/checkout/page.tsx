import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getVisibleProducts } from "@/data/catalog";
import { accessoriesByCategory } from "@/data/accessories";
import type { CartAccessoryInfo, CartProductInfo } from "@/components/cart/CartView";
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
 * /api/checkout/cash/start, /api/checkout/paypal/start, or /api/checkout/bit/start, each of
 * which re-prices everything with the shared pricing engine. Online payment is only offered
 * once its own credentials are set (owner decision 2026-10-31, Part 7) — until then the
 * checkout UI simply doesn't show that button, same as cash's own cashEnabled gate below.
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

  const accessories: CartAccessoryInfo[] = accessoriesByCategory("keychain").map((accessory) => ({
    handle: accessory.handle,
    team: accessory.team,
    teamAr: accessory.teamAr,
    price: accessory.price,
    image: accessory.image,
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
          accessories={accessories}
          locale={locale}
          cashEnabled={!!process.env.SUPABASE_SERVICE_ROLE_KEY}
          // Read straight off process.env, same as cashEnabled above, rather
          // than through isPayPalConfigured()/isPayPlusConfigured() (which go
          // through src/lib/env.ts's zod schema): that schema requires the
          // Supabase/Anthropic variables too, so in any environment missing
          // those (this page's own render has no other use for them) calling
          // it here would 500 the whole checkout page over unrelated
          // variables. The API routes that actually move money still go
          // through the real isPayPalConfigured()/isPayPlusConfigured().
          paypalEnabled={!!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET)}
          bitEnabled={!!(process.env.PAYPLUS_API_KEY && process.env.PAYPLUS_SECRET_KEY && process.env.PAYPLUS_PAYMENT_PAGE_UID)}
        />
      </Suspense>
    </Wrap>
  );
}
