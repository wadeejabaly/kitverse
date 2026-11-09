import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/config";
import { accessoriesByCategory, keychainForTeam } from "@/data/accessories";
import { slugify } from "@/data/slug";
import { AccessoryForm } from "@/components/product/AccessoryForm";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Wrap } from "@/components/shared/PageLede";
import { alternatesFor, localeUrl } from "@/lib/site";

/**
 * One team's keychain. The `team` param is the team's own slug (matching
 * every other team-scoped URL on the site, e.g. /shop/real-madrid), not the
 * accessory's `keychain-<slug>` handle — keychainForTeam() does that lookup,
 * same as catalog.ts's byTeam() does for shirts.
 */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    accessoriesByCategory("keychain").map((accessory) => ({
      locale,
      team: slugify(accessory.team),
    })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; team: string }>;
}): Promise<Metadata> {
  const { locale, team: teamSlug } = await params;
  const accessory = keychainForTeam(teamSlug);
  if (!accessory || !accessory.visible) return {};

  const t = await getTranslations({ locale, namespace: "accessories" });
  const team = locale === "ar" ? accessory.teamAr : locale === "he" && accessory.teamHe ? accessory.teamHe : accessory.team;
  const title = t("keychainTitle", { team });

  return {
    title,
    description: t("metaDescription", { team }),
    alternates: alternatesFor(locale, `/accessories/keychains/${teamSlug}`),
    openGraph: {
      title,
      description: t("metaDescription", { team }),
      images: [{ url: accessory.image, width: 900, height: 900, alt: title }],
      type: "website",
    },
  };
}

export default async function KeychainPage({
  params,
}: {
  params: Promise<{ locale: string; team: string }>;
}) {
  const { locale, team: teamSlug } = await params;
  setRequestLocale(locale);

  const accessory = keychainForTeam(teamSlug);
  if (!accessory || !accessory.visible) notFound();

  const t = await getTranslations("accessories");
  const team = locale === "ar" ? accessory.teamAr : locale === "he" && accessory.teamHe ? accessory.teamHe : accessory.team;
  const title = t("keychainTitle", { team });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    image: localeUrl(locale, accessory.image),
    description: t("metaDescription", { team }),
    sku: accessory.handle,
    brand: { "@type": "Brand", name: team },
    offers: {
      "@type": "Offer",
      priceCurrency: "ILS",
      price: String(accessory.price),
      availability: "https://schema.org/InStock",
      url: localeUrl(locale, `/accessories/keychains/${teamSlug}`),
    },
  };

  return (
    <Wrap>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumbs
        tone="light"
        className="pt-6"
        items={[
          { label: t("categoryTitle"), href: "/accessories" },
          { label: t("keychainsLabel"), href: "/accessories/keychains" },
          { label: team },
        ]}
      />

      <section className="grid items-start gap-10 pt-8 pb-16 wide:grid-cols-2 wide:gap-14">
        <div className="wide:sticky wide:top-24">
          <div className="kv-panel grid aspect-square place-items-center overflow-hidden" style={{ background: "linear-gradient(180deg,#f6f7fb,#e9edf5)" }}>
            <Image
              src={accessory.image}
              alt={title}
              width={900}
              height={900}
              priority
              sizes="(max-width: 900px) 100vw, 50vw"
              className="h-auto w-[86%] mix-blend-multiply"
            />
          </div>
        </div>

        <div>
          <span className="kv-chip">{team}</span>
          <h1 className="mt-4 mb-3 text-[clamp(1.7rem,3vw,2.4rem)] leading-tight font-extrabold">{title}</h1>
          <p className="mb-7 max-w-[46ch] text-ink-soft">{t("keychainBody")}</p>
          <AccessoryForm handle={accessory.handle} price={accessory.price} />
        </div>
      </section>
    </Wrap>
  );
}
