import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Figure } from "@/components/shared/Money";
import { PageLede, Prose, ProseParagraph, Wrap } from "@/components/shared/PageLede";
import { alternatesFor } from "@/lib/site";

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

  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />

      {/* The table is the one wide thing on the site: it scrolls inside its
          own container so the page body never scrolls sideways on a phone. */}
      <div className="overflow-x-auto pt-8 pb-5">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <Th>{t("colSize")}</Th>
              <Th>{t("colChest")}</Th>
              <Th>{t("colLength")}</Th>
              <Th>{t("colFits")}</Th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.size}>
                <Td>
                  <span className="latin tabular">{row.size}</span>
                </Td>
                <Td>
                  <Figure>{row.chest}</Figure>
                </Td>
                <Td>
                  <Figure>{row.length}</Figure>
                </Td>
                <Td>
                  <span className="latin tabular">{row.fits}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Prose>
        <ProseParagraph>{t("note")}</ProseParagraph>
        <ProseParagraph>{t("surcharge")}</ProseParagraph>
      </Prose>
    </Wrap>
  );
}

/**
 * Column headers take the mono eyebrow treatment, which the globals rule
 * neutralises in Arabic — never tracked, never uppercased there.
 */
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="mono-eyebrow border-b border-rule px-2.5 py-3 text-start font-normal text-ink-soft">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-rule px-2.5 py-3 text-start">{children}</td>;
}
