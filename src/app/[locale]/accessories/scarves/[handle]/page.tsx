import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/config";
import { accessoriesByCategory, accessoryTeam, accessoryVariant, getAccessory, isInStock } from "@/data/accessories";
import { AccessoryForm } from "@/components/product/AccessoryForm";
import { AccessoryDealNote } from "@/components/product/AccessoryDealNote";
import { accessoryLabel } from "@/components/shop/accessoryLabel";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Wrap } from "@/components/shared/PageLede";
import { alternatesFor, localeUrl } from "@/lib/site";

/** One scarf design (owner request 2026-11-10). Addressed by its own handle: a team can have several scarves. */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) => accessoriesByCategory("scarf").map((a) => ({ locale, handle: a.handle })));
}

function scarf(handle: string) {
  const a = getAccessory(handle);
  return a && a.visible && a.category === "scarf" ? a : null;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; handle: string }> }): Promise<Metadata> {
  const { locale, handle } = await params;
  const a = scarf(handle);
  if (!a) return {};
  const t = await getTranslations({ locale, namespace: "accessories" });
  const title = accessoryLabel(t, a, locale);
  const description = t("scarfMetaDescription", { team: accessoryTeam(a, locale), variant: accessoryVariant(a, locale) ?? "" });
  return {
    title,
    description,
    alternates: alternatesFor(locale, `/accessories/scarves/${handle}`),
    openGraph: { title, description, images: [{ url: a.image, width: 1200, height: 1200, alt: title }], type: "website" },
  };
}

export default async function ScarfPage({ params }: { params: Promise<{ locale: string; handle: string }> }) {
  const { locale, handle } = await params;
  setRequestLocale(locale);
  const a = scarf(handle);
  if (!a) notFound();
  const t = await getTranslations("accessories");
  const team = accessoryTeam(a, locale);
  const title = accessoryLabel(t, a, locale);
  const tCommon = await getTranslations("common");
  const inStock = isInStock(a);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    image: localeUrl(locale, a.image),
    description: t("scarfMetaDescription", { team, variant: accessoryVariant(a, locale) ?? "" }),
    sku: a.handle,
    brand: { "@type": "Brand", name: team },
    offers: { "@type": "Offer", priceCurrency: "ILS", price: String(a.price), availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: localeUrl(locale, `/accessories/scarves/${handle}`) },
  };

  return (
    <Wrap>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs
        tone="light"
        className="pt-6"
        items={[{ label: t("categoryTitle"), href: "/accessories" }, { label: t("scarvesLabel"), href: "/accessories/scarves" }, { label: title }]}
      />
      <section className="grid items-start gap-10 pt-8 pb-16 wide:grid-cols-2 wide:gap-14">
        <div className="wide:sticky wide:top-24">
          <div className="kv-panel grid aspect-square place-items-center overflow-hidden" style={{ background: "linear-gradient(180deg,#f6f7fb,#e9edf5)" }}>
            <Image src={a.image} alt={title} width={1200} height={1200} priority sizes="(max-width: 900px) 100vw, 50vw" className="h-auto w-[90%] mix-blend-multiply" />
          </div>
        </div>
        <div>
          <span className="kv-chip">{team}</span>
          <h1 className="mt-4 mb-3 text-[clamp(1.7rem,3vw,2.4rem)] leading-tight font-extrabold">{title}</h1>
          <p className="mb-5 max-w-[46ch] text-ink-soft">{t("scarfBody")}</p>
          {inStock ? (
            <>
              <AccessoryDealNote category="scarf" className="mb-6" />
              <AccessoryForm handle={a.handle} price={a.price} />
            </>
          ) : (
            <p className="mono-eyebrow border border-rule px-4 py-3 text-ink-soft">{tCommon("outOfStock")}</p>
          )}
        </div>
      </section>
    </Wrap>
  );
}
