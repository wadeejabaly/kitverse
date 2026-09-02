import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ClearCartOnOrder } from "@/components/checkout/ClearCartOnOrder";
import { OrderReference } from "@/components/checkout/OrderReference";
import {
  PageLede,
  Prose,
  ProseParagraph,
  Wrap,
} from "@/components/shared/PageLede";
import { findOrderStatusByReference } from "@/lib/order-service";
import { alternatesFor } from "@/lib/site";
import { getSupabaseAdmin } from "@/lib/supabase";

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
 * Order confirmation.
 *
 * THIS PAGE DOES NOT DECIDE ANYTHING, and it does not take the customer's
 * word for it either. The card path brings a buyer back here by redirect, and
 * a redirect the browser followed is not evidence that money moved — the
 * PayPlus callback is, and it may land a moment later or a moment earlier.
 * So the page asks the database what the order's status actually is and says
 * only that:
 *
 *   paid                 → "we have your order", the confirmed copy;
 *   anything else, or an
 *   order it cannot find → "we are confirming your payment", with a refresh.
 *
 * The query string carries the short reference and nothing else, and the
 * lookup returns the status and nothing else, so a shared or guessed URL
 * discloses no name, no amount and no email. Reaching the page with no
 * reference at all (a bookmark, a stray link) keeps the plain copy it always
 * had.
 */
export default async function ThankYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("thankYou");

  const raw = (await searchParams).ref;
  const reference = (typeof raw === "string" ? raw : "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 16)
    .toUpperCase();

  // No reference: nothing to look up and nothing to claim either way.
  // A reference we cannot confirm as paid gets the honest holding copy.
  const db = reference === "" ? null : getSupabaseAdmin();
  const status = db ? await findOrderStatusByReference(db, reference) : null;
  const confirmed = reference === "" || status === "paid";

  return (
    <Wrap>
      <PageLede
        eyebrow={t("eyebrow")}
        title={confirmed ? t("title") : t("confirmingTitle")}
        intro={confirmed ? t("intro") : t("confirmingIntro")}
      />
      <Prose>
        <OrderReference reference={reference} />
        {confirmed ? (
          <>
            <ProseParagraph>{t("delivery")}</ProseParagraph>
            <ProseParagraph>{t("emailNote")}</ProseParagraph>
          </>
        ) : (
          <ProseParagraph>{t("confirmingNote")}</ProseParagraph>
        )}
        <Link href="/shop" className="btn mt-4">
          {t("keepShopping")}
        </Link>
      </Prose>
      {reference === "" ? null : <ClearCartOnOrder />}
    </Wrap>
  );
}
