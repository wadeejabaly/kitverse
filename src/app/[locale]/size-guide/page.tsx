import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Figure } from "@/components/shared/Money";
import { sizeSurcharge } from "@/data/pricing";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/shared/Info";
import { alternatesFor } from "@/lib/site";
import { SizeHelper } from "@/components/product/SizeHelper";

/**
 * Measurements as supplied, S through 4XL. Centimetres, and the European size
 * each one actually fits — the shirts run about a size small, and saying so
 * plainly prevents most of the returns.
 */
const ROWS = [
  { size: "S", chest: 96, length: 68, fits: "XS–S" },
  { size: "M", chest: 102, length: 70, fits: "S–M" },
  { size: "L", chest: 108, length: 72, fits: "M–L" },
  { size: "XL", chest: 114, length: 74, fits: "L–XL" },
  { size: "XXL", chest: 120, length: 76, fits: "XL–XXL" },
  { size: "3XL", chest: 126, length: 78, fits: "XXL–3XL" },
  { size: "4XL", chest: 132, length: 80, fits: "3XL–4XL" },
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "sizeGuide" });
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: alternatesFor(locale, "/size-guide"),
  };
}

export default async function SizeGuidePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("sizeGuide");

  // Redesign phase 2 (2026-11-09): navy-headed table on a white card, a
  // "how to measure" diagram beside it, the size finder, and the notes.
  // The measurements are the same verified ROWS as before. Youth sizes are
  // not in the website catalogue and there is no verified youth size data,
  // so the page says so plainly instead of inventing a chart.
  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />

      <div className="grid gap-6 py-10 wide:grid-cols-[1.35fr_1fr] wide:gap-8 wide:py-14">
        <section className="kv-panel min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-5 pt-5 pb-4 sm:px-6">
            <h2 className="text-[18px] font-extrabold">{t("adultTitle")}</h2>
            <span className="rounded-full bg-chip px-3 py-1 text-[12px] font-semibold text-ink-soft">{t("unit")}</span>
          </div>
          {/* The table scrolls inside its own container so the page body
              never scrolls sideways on a phone. */}
          <div className="overflow-x-auto px-5 pb-5 sm:px-6">
            <table className="kv-table min-w-[420px]">
              <thead>
                <tr>
                  <th>{t("colSize")}</th>
                  <th>{t("colChest")}</th>
                  <th>{t("colLength")}</th>
                  <th>{t("colFits")}</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.size}>
                    <td>
                      <span className="latin tabular">{row.size}</span>
                    </td>
                    <td>
                      <Figure>{row.chest}</Figure>
                    </td>
                    <td>
                      <Figure>{row.length}</Figure>
                    </td>
                    <td>
                      <span className="latin tabular">{row.fits}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-2 border-t border-rule bg-chip/50 px-5 py-4 text-[13.5px] text-ink-soft sm:px-6">
            <p>{t("note")}</p>
            <p className="font-semibold text-ink">
              {t("surcharge", { xl3: `₪${sizeSurcharge("3XL")}`, xl4: `₪${sizeSurcharge("4XL")}` })}
            </p>
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          <section className="kv-panel p-6">
            <h2 className="mb-4 text-[18px] font-extrabold">{t("measureTitle")}</h2>
            <div className="grid grid-cols-[120px_1fr] items-center gap-5">
              {/* A plain diagram: chest across under the arms, length from the
                  shoulder's highest point to the hem — exactly what `note`
                  describes. */}
              <svg viewBox="0 0 120 130" aria-hidden className="w-full text-ink">
                <path
                  d="M38 10 14 24l10 18 12-7v82h48V35l12 7 10-18-24-14c-3 6-10 10-22 10s-19-4-22-10Z"
                  fill="var(--chip)"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path d="M38 48h44" stroke="#1f5cff" strokeWidth="2" strokeLinecap="round" />
                <path d="m41 45-3 3 3 3M79 45l3 3-3 3" stroke="#1f5cff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M100 12v105" stroke="#c9a55c" strokeWidth="2" strokeLinecap="round" />
                <path d="m97 15 3-3 3 3M97 114l3 3 3-3" stroke="#c9a55c" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <ul className="flex flex-col gap-3 text-[14px]">
                <li className="flex gap-2.5">
                  <span className="mt-1.5 h-0.5 w-4 shrink-0 bg-[#1f5cff]" />
                  <span>
                    <strong className="block">{t("chestLabel")}</strong>
                    <span className="text-ink-soft">{t("chestHow")}</span>
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 h-0.5 w-4 shrink-0 bg-[#c9a55c]" />
                  <span>
                    <strong className="block">{t("lengthLabel")}</strong>
                    <span className="text-ink-soft">{t("lengthHow")}</span>
                  </span>
                </li>
              </ul>
            </div>
          </section>

          <section className="kv-panel p-6">
            <h2 className="mb-1 text-[18px] font-extrabold">{t("finderTitle")}</h2>
            {/* No `onPick` here — this page has no size selection of its own
                to write a result into, unlike the one in the product buy box. */}
            <SizeHelper />
          </section>

          <section className="kv-panel flex gap-4 p-6">
            <span className="kv-icon-tile">
              <Icon name="star" />
            </span>
            <div>
              <h2 className="mb-1 text-[16px] font-extrabold">{t("youthTitle")}</h2>
              <p className="text-[14px] text-ink-soft">{t("youthBody")}</p>
            </div>
          </section>

          <Link href="/shop" className="btn w-full">
            {t("shopCta")}
          </Link>
        </div>
      </div>
    </Wrap>
  );
}
