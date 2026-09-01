"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * The order reference on the confirmation page, read from `?ref=`.
 *
 * A short, non-guessable-looking slice of the order uuid and nothing else: no
 * name, no amount, no email in the URL, so a shared or logged link discloses
 * nothing about the customer. Rendered LTR and tabular — it is a Latin code
 * inside Arabic copy.
 *
 * useSearchParams needs a Suspense boundary; the parent page provides it.
 */
export function OrderReference() {
  const t = useTranslations("thankYou");
  const params = useSearchParams();
  const reference = (params.get("ref") ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 16);

  if (reference === "") return null;

  return (
    <p className="mb-6 flex flex-wrap items-baseline gap-2 border border-rule bg-chip px-4 py-3.5 text-sm">
      <span className="text-ink-soft">{t("referenceLabel")}</span>
      <bdi dir="ltr" className="latin tabular text-base">
        {reference}
      </bdi>
    </p>
  );
}
