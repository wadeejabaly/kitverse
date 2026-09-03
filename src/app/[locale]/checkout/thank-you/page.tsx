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
import { getBitPhoneNumber } from "@/lib/bit";
import { findOrderStateByReference } from "@/lib/order-service";
import { codConfirmationFor } from "@/lib/orders";
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
 *   awaiting_deposit on
 *   a bit_cod order      → the cash-on-delivery instructions;
 *   anything else, or an
 *   order it cannot find → "we are confirming your payment", with a refresh.
 *
 * The COD state is built ENTIRELY from server-side facts: the status, the
 * rail and the deposit come out of the order row, and the Bit number comes
 * from server-only env. Nothing about it is carried over from the checkout
 * screen's state, so a buyer who reloads, or opens the link on their phone to
 * pay, sees the same instructions and the same amount — and a browser can
 * never talk this page into naming a deposit the server did not record.
 *
 * The query string carries the short reference and nothing else, and the
 * lookup returns the status, the rail and (for COD only) the deposit tier, so
 * a shared or guessed URL discloses no name, no address, no email and not the
 * order total. Reaching the page with no reference at all (a bookmark, a stray
 * link) keeps the plain copy it always had.
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
  const state = db ? await findOrderStateByReference(db, reference) : null;

  // The COD gate is a pure function in src/lib/orders.ts so it can be
  // unit-tested: it shows the deposit instructions only when the row is a
  // bit_cod order still awaiting its deposit, with a deposit recorded and a
  // number to send it to. Anything less falls through to the holding copy.
  const cod = codConfirmationFor(state, getBitPhoneNumber());

  const confirmed = reference === "" || state?.status === "paid";

  return (
    <Wrap>
      <PageLede
        eyebrow={cod ? t("codEyebrow") : t("eyebrow")}
        title={cod ? t("codTitle") : confirmed ? t("title") : t("confirmingTitle")}
        intro={cod ? t("codIntro") : confirmed ? t("intro") : t("confirmingIntro")}
      />
      <Prose>
        <OrderReference reference={reference} />
        {cod ? (
          <>
            {/* The three facts the buyer needs to pay, laid out rather than
                buried in a sentence: where to send it, how much, and what to
                write in the note so the owner can match it to this order. */}
            <dl className="mb-6 grid gap-3 border border-rule bg-chip px-4 py-4 text-sm">
              <CodFact label={t("codPhoneLabel")} value={cod.phone} />
              <CodFact label={t("codAmountLabel")} value={`₪${cod.deposit}`} />
              <CodFact label={t("codNoteLabel")} value={reference} />
            </dl>
            <ProseParagraph>
              {t("codBody", { amount: String(cod.deposit) })}
            </ProseParagraph>
            <ProseParagraph>{t("codTerms")}</ProseParagraph>
            <ProseParagraph>{t("delivery")}</ProseParagraph>
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

/**
 * One label/value pair of the Bit payment card. Every value here is Latin —
 * a phone number, an amount, a reference code — so each is isolated and
 * tabular inside the Arabic page.
 */
function CodFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="m-0">
        <bdi dir="ltr" className="latin tabular text-base">
          {value}
        </bdi>
      </dd>
    </div>
  );
}
