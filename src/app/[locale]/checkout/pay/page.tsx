import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClearCartOnOrder } from "@/components/checkout/ClearCartOnOrder";
import { ManualPayPanel } from "@/components/checkout/ManualPayPanel";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { readOrderToken } from "@/lib/orders/link";
import { manualPayView } from "@/lib/orders/manual-pay";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "manualPay" });
  // Per-order payment page - never indexed, never in the sitemap.
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * The pay page for a personal-Bit / PayPal.Me order (owner requests
 * 2026-11-10). Opened with the order's signed token (only the person who
 * placed the order has it). Everything shown comes from the database on each
 * load - the state, the amount, the payee - so coming back from Bit or PayPal
 * never changes anything by itself; only the owner's confirmation in admin
 * makes the order paid.
 */
export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("manualPay");
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : "";
  const orderId = token ? readOrderToken(token) : null;
  if (!orderId) notFound();
  const view = await manualPayView(orderId);
  if (!view) notFound();

  const titleKey = view.state === "paid" ? "titlePaid" : view.state === "awaiting_verification" ? "titleVerifying" : view.state === "failed" || view.state === "cancelled" ? "titleClosed" : view.method === "bit_personal" ? "titleBit" : "titlePayPal";
  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow", { number: view.number })} title={t(titleKey)} />
      <ManualPayPanel
        token={token}
        view={{
          number: view.number,
          method: view.method,
          totalLabel: view.totalLabel,
          note: view.note,
          state: view.state,
          reviewNote: view.reviewNote,
          reportedReference: view.reportedReference,
          reportedProof: view.reportedProof,
          bit: view.bit,
          paypalUrl: view.paypal?.url ?? null,
          methodUnavailable: view.methodUnavailable,
        }}
      />
      <ClearCartOnOrder />
    </Wrap>
  );
}
