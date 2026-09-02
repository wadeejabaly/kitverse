import { getTranslations } from "next-intl/server";

/**
 * The order reference on the confirmation page.
 *
 * A short, non-guessable-looking slice of the order uuid and nothing else: no
 * name, no amount, no email in the URL, so a shared or logged link discloses
 * nothing about the customer. Rendered LTR and tabular — it is a Latin code
 * inside Arabic copy.
 *
 * The reference is passed in rather than read from the URL here, because the
 * page already has it: it looks the order's STATUS up by this value, and
 * reading the same parameter twice from two places is how the two come to
 * disagree.
 */
export async function OrderReference({ reference }: { reference: string }) {
  if (reference === "") return null;
  const t = await getTranslations("thankYou");

  return (
    <p className="mb-6 flex flex-wrap items-baseline gap-2 border border-rule bg-chip px-4 py-3.5 text-sm">
      <span className="text-ink-soft">{t("referenceLabel")}</span>
      <bdi dir="ltr" className="latin tabular text-base">
        {reference}
      </bdi>
    </p>
  );
}
