import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import {
  accessoriesByCategory,
  accessoryTeam,
  accessoryVariant,
  getAccessory,
  isInStock,
} from "@/data/accessories";
import { AccessoryForm } from "@/components/product/AccessoryForm";
import { accessoryLabel } from "@/components/shop/accessoryLabel";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { Wrap } from "@/components/shared/PageLede";
import { alternatesFor, localeUrl } from "@/lib/site";

/** One phone case design + colour (owner request 2026-11-16). The phone model is picked in the buy box. */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    accessoriesByCategory("phone_case").map((a) => ({
      locale,
      handle: a.handle,
    })),
  );
}

function phoneCase(handle: string) {
  const a = getAccessory(handle);
  return a && a.visible && a.category === "phone_case" ? a : null;
}

/** The other cases shown as switches: the same Messi design in its other colours, or the team's other designs. */
const designOf = (a: { handle: string; team: string }) =>
  a.team === "Messi" ? a.handle.replace(/-[a-z]+$/, "") : a.team;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}): Promise<Metadata> {
  const { locale, handle } = await params;
  const a = phoneCase(handle);
  if (!a) return {};
  const t = await getTranslations({ locale, namespace: "accessories" });
  const title = accessoryLabel(t, a, locale);
  const description = t("phoneCaseMetaDescription", {
    team: accessoryTeam(a, locale),
    variant: accessoryVariant(a, locale) ?? "",
  });
  return {
    title,
    description,
    alternates: alternatesFor(locale, `/accessories/phone-cases/${handle}`),
    openGraph: {
      title,
      description,
      images: [{ url: a.image, width: 800, height: 800, alt: title }],
      type: "website",
    },
  };
}

export default async function PhoneCasePage({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}) {
  const { locale, handle } = await params;
  setRequestLocale(locale);
  const a = phoneCase(handle);
  if (!a) notFound();
  const t = await getTranslations("accessories");
  const tCommon = await getTranslations("common");
  const team = accessoryTeam(a, locale);
  const title = accessoryLabel(t, a, locale);
  const inStock = isInStock(a);
  const siblings = accessoriesByCategory("phone_case").filter(
    (x) => designOf(x) === designOf(a),
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    image: localeUrl(locale, a.image),
    description: t("phoneCaseMetaDescription", {
      team,
      variant: accessoryVariant(a, locale) ?? "",
    }),
    sku: a.handle,
    offers: {
      "@type": "Offer",
      priceCurrency: "ILS",
      price: String(a.price),
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: localeUrl(locale, `/accessories/phone-cases/${handle}`),
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
          { label: t("phoneCasesLabel"), href: "/accessories/phone-cases" },
          { label: title },
        ]}
      />
      <section className="grid items-start gap-10 pt-8 pb-16 wide:grid-cols-2 wide:gap-14">
        <div className="wide:sticky wide:top-24">
          <div className="kv-panel overflow-hidden">
            <Image
              src={a.image}
              alt={title}
              width={800}
              height={800}
              priority
              sizes="(max-width: 900px) 100vw, 50vw"
              className="h-auto w-full"
            />
          </div>
          {a.gallery?.length ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {a.gallery.map((src) => (
                <div key={src} className="kv-panel overflow-hidden">
                  <Image
                    src={src}
                    alt=""
                    width={400}
                    height={400}
                    sizes="(max-width: 900px) 50vw, 25vw"
                    className="h-auto w-full"
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div>
          <span className="kv-chip">{team}</span>
          <h1 className="mt-4 mb-3 text-[clamp(1.7rem,3vw,2.4rem)] leading-tight font-extrabold">
            {title}
          </h1>
          <p className="mb-5 max-w-[46ch] text-ink-soft">
            {t("phoneCaseBody")}
          </p>
          {siblings.length > 1 ? (
            <div className="mb-7 flex flex-wrap gap-3">
              {siblings.map((s) => (
                <Link
                  key={s.handle}
                  href={`/accessories/phone-cases/${s.handle}`}
                  aria-current={s.handle === a.handle ? "page" : undefined}
                  className={`block w-[72px] overflow-hidden rounded-[10px] border-2 ${s.handle === a.handle ? "border-accent" : "border-rule"}`}
                >
                  <Image
                    src={s.image}
                    alt={accessoryVariant(s, locale) ?? ""}
                    width={144}
                    height={144}
                    sizes="72px"
                    className="h-auto w-full"
                  />
                </Link>
              ))}
            </div>
          ) : null}
          {inStock ? (
            <AccessoryForm
              handle={a.handle}
              price={a.price}
              phoneModels={a.phoneModels}
            />
          ) : (
            <p className="mono-eyebrow border border-rule px-4 py-3 text-ink-soft">
              {tCommon("outOfStock")}
            </p>
          )}
        </div>
      </section>
    </Wrap>
  );
}
