import type { Metadata } from "next";
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
 * Checkout. Like the cart, the page itself is static: the lines live in the
 * visitor's browser and the server contributes only the catalogue facts a
 * line needs to render. Only approved products are sent.
 *
 * The PayPal client id is read here and passed down. It is the one PayPal
 * value that is public by design — the secret, the webhook id and the
 * Supabase service-role key exist only inside src/lib/paypal.ts and
 * src/lib/supabase.ts, both of which are `server-only`. When the client id is
 * absent the page still renders in full and shows a quiet "payments are not
 * configured yet" panel where the buttons would be, so the store builds and
 * runs with no environment at all.
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
    kind: product.kind,
  }));

  const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? null;

  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />
      <CheckoutView
        products={products}
        locale={locale}
        paypalClientId={paypalClientId}
      />
    </Wrap>
  );
}
