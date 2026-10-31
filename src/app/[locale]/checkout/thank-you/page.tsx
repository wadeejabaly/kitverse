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
import { readOrderToken } from "@/lib/orders/link";
import { orderPublicState } from "@/lib/orders/online";
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
 * Order confirmation.
 *
 * THIS PAGE DOES NOT DECIDE ANYTHING, and it does not take the customer's
 * word for it either. The card path brings a buyer back here by redirect, and
 * a redirect the browser followed is not evidence that money moved — the
 * PayPlus callback is, and it may land a moment later or a moment earlier.
 * So the page asks the database what the order's status actually is and says
 * only that:
 *
 *   a `cash` order        → confirmed immediately — there is no payment to
 *                           wait for, the buyer pays the courier on arrival
 *                           (owner decision 2026-10-23: plain cash, no
 *                           deposit, so there is nothing more to tell them
 *                           than that the order is placed);
 *   paid (any card order) → "we have your order", the confirmed copy;
 *   anything else, or an
 *   order it cannot find  → "we are confirming your payment", with a refresh.
 *
 * The query string carries the short reference and nothing else, and the
 * lookup returns only the status and the rail, so a shared or guessed URL
 * discloses no name, no address, no email and not the order total — not even
 * for a cash order, which keeps the same privacy posture a card order has
 * always had here. Reaching the page with no reference at all (a bookmark, a
 * stray link) keeps the plain copy it always had.
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

  const sp = await searchParams;
  const raw = sp.ref;
  const reference = (typeof raw === "string" ? raw : "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 16)
    .toUpperCase();

  // the signed token from checkout proves this visitor placed the order; it opens the live order page
  const token = typeof sp.t === "string" ? sp.t : "";
  const orderId = token ? readOrderToken(token) : null;
  const orderUrl = orderId ? `/o/${token}` : null;

  // A cash order is confirmed the moment it's placed — there's no payment to
  // wait for. A PayPal/Bit order only reaches this page via its own
  // /api/checkout/*/return route AFTER settleOnlinePayment has already run
  // (owner decision 2026-10-31, Part 7), so `state.paid` is almost always
  // true by the time this loads; the false branch exists for the rare race
  // where the redirect outran the write, and simply asks the visitor to wait.
  // A reference with no resolvable order (a stale or malformed link) gets
  // the same honest "confirming" copy rather than a guess.
  const state = orderId ? await orderPublicState(orderId) : null;
  const isCash = state?.method === "cod";
  const confirmed = isCash || (state?.paid ?? false);

  return (
    <Wrap>
      <PageLede
        eyebrow={isCash ? t("cashEyebrow") : t("eyebrow")}
        title={isCash ? t("cashTitle") : confirmed ? t("title") : t("confirmingTitle")}
        intro={isCash ? t("cashIntro") : confirmed ? t("intro") : t("confirmingIntro")}
      />
      <Prose>
        <OrderReference reference={reference} />
        {isCash ? (
          <>
            <ProseParagraph>{t("cashNote")}</ProseParagraph>
            <ProseParagraph>{t("delivery")}</ProseParagraph>
            {orderUrl ? (
              <a href={orderUrl} className="btn-quiet mt-2">
                {t("viewOrder")}
              </a>
            ) : null}
          </>
        ) : confirmed ? (
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
