import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { OrderReference } from "@/components/checkout/OrderReference";
import {
  PageLede,
  Prose,
  ProseParagraph,
  Wrap,
} from "@/components/shared/PageLede";
import { alternatesFor } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "thankYou" });
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: alternatesFor(locale, "/checkout/thank-you"),
    // Per-order confirmation — never indexed, never in the sitemap.
    robots: { index: false, follow: false },
  };
}

/**
 * Order confirmation. Static and stateless: the order reference arrives in
 * the query string and nothing here reads the database, so the page cannot
 * leak an order to anyone who guesses a URL and cannot break if Supabase is
 * unreachable. The authoritative record is the owner's notification email and
 * the orders table.
 */
export default async function ThankYouPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("thankYou");

  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />
      <Prose>
        <Suspense fallback={null}>
          <OrderReference />
        </Suspense>
        <ProseParagraph>{t("delivery")}</ProseParagraph>
        <ProseParagraph>{t("emailNote")}</ProseParagraph>
        <Link href="/shop" className="btn mt-4">
          {t("keepShopping")}
        </Link>
      </Prose>
    </Wrap>
  );
}
