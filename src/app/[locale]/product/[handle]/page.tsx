import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/config";
import { getLeagues, getProduct, getVisibleProducts, localName } from "@/data/catalog";
import { isRetroSeason, priceFor } from "@/data/pricing";
import { slugify } from "@/data/slug";
import { Reveal } from "@/components/motion/Reveal";
import { ProductForm } from "@/components/product/ProductForm";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductSleeveProvider } from "@/components/product/ProductSleeveContext";
import { ProductGrid } from "@/components/shop/ProductCard";
import { Season } from "@/components/shared/Money";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { SectionHead, Wrap } from "@/components/shared/PageLede";
import { teamFor, titleFor } from "@/lib/product";
import { alternatesFor, localeUrl } from "@/lib/site";
import { enabledPaymentMethods } from "@/lib/payment-methods";

/**
 * Product detail page.
 *
 * Only approved products are pre-rendered, and a request for a hidden or
 * unknown handle 404s: getProduct() deliberately returns hidden products (the
 * review tool needs them), so the visibility gate lives here, at the page
 * level, exactly as the data contract specifies.
 */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    getVisibleProducts().map((product) => ({ locale, handle: product.handle })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}): Promise<Metadata> {
  const { locale, handle } = await params;
  const product = getProduct(handle);
  if (!product || !product.visible) return {};

  const t = await getTranslations({ locale, namespace: "product" });
  const title = titleFor(product, locale);

  return {
    title,
    description: t("metaDescription", { title }),
    alternates: alternatesFor(locale, `/product/${handle}`),
    openGraph: {
      title,
      description: t("metaDescription", { title }),
      images: [{ url: product.image, width: 2048, height: 2048, alt: title }],
      type: "website",
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}) {
  const { locale, handle } = await params;
  setRequestLocale(locale);

  const product = getProduct(handle);
  if (!product || !product.visible) notFound();

  const t = await getTranslations("product");
  const tShop = await getTranslations("shop");
  const tNav = await getTranslations("nav");

  const title = titleFor(product, locale);
  const team = teamFor(product, locale);
  const teamSlug = slugify(product.team);
  const league = getLeagues().find((entry) => entry.slug === product.league);
  const leagueName = league ? localName(league, locale) : null;

  const related = getVisibleProducts()
    .filter((entry) => entry.handle !== product.handle && slugify(entry.team) === teamSlug)
    .slice(0, 4);

  // Product JSON-LD. The price is the Fan/size-S entry point — the same figure
  // the card and the buy box open with — and comes from pricing.ts, never a
  // literal. No inventory is tracked, so availability is always InStock.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    image: localeUrl(locale, product.image),
    description: t("metaDescription", { title }),
    sku: product.handle,
    brand: { "@type": "Brand", name: team },
    offers: {
      "@type": "Offer",
      priceCurrency: "ILS",
      price: String(priceFor(product.season, "S", "fan")),
      availability: "https://schema.org/InStock",
      url: localeUrl(locale, `/product/${product.handle}`),
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
          { label: t("breadcrumbShop"), href: "/shop" },
          ...(leagueName && product.league ? [{ label: leagueName, href: `/shop/${product.league}` }] : []),
          { label: team, href: `/shop/${teamSlug}` },
          { label: title },
        ]}
      />

      {/* Wraps both columns in one shared Sleeve choice (owner decision
          2026-10-26): picking "Long sleeve" in <ProductForm> can swap
          <ProductGallery>'s photo too, even though the two sit in different
          columns below with no other parent in common — see
          ProductSleeveContext.tsx. */}
      <ProductSleeveProvider>
        <section className="grid items-start gap-8 pt-6 pb-14 wide:grid-cols-[1.08fr_1fr] wide:gap-14">
          {/* The tile is sticky so the buy box can scroll past it on tall
              screens. Most products have one photo today; a product with more
              (see Product.images) gets a thumbnail row under the tile — see
              <ProductGallery>.

              No reveal on the gallery: the first photo is the LCP element on
              this page, and an entrance on the thing the reader came to see is
              the one place where motion costs more than it gives. The details
              column opposite carries the entrance instead, 90ms behind the
              fold — enough to read as "the page settled", not as a curtain. */}
          <div className="min-w-0 wide:sticky wide:top-24">
            <ProductGallery
              images={[product.image, ...(product.images ?? [])]}
              imagesLongSleeve={product.imagesLongSleeve}
              alt={title}
            />
          </div>

          <Reveal delay={90}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="kv-chip">{team}</span>
              <span className="kv-chip latin">
                <Season value={product.season} />
              </span>
              <span className="kv-chip">{t(`kit.${product.kit}`)}</span>
              {isRetroSeason(product.season) ? (
                <span className="kv-chip">{t("retroBadge")}</span>
              ) : null}
            </div>
            <h1 className="mt-4 mb-4 text-[clamp(1.7rem,3vw,2.4rem)] leading-tight font-extrabold tracking-[-0.02em]">
              {title}
            </h1>

            <ProductForm
              handle={product.handle}
              season={product.season}
              league={product.league}
              team={product.team}
              kind={product.kind}
              leagueName={leagueName}
              image={product.image}
              title={title}
            />

            {/* Service strip: facts the shop already states elsewhere
                (delivery window from the shipping page, cash on delivery
                and online payment from checkout). */}
            <ul className="mt-7 grid gap-3 rounded-[14px] border border-rule bg-tile p-4 text-[13.5px] sm:grid-cols-2">
              <li className="flex items-center gap-3">
                <span className="kv-icon-tile !size-9 !rounded-[10px]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" strokeLinejoin="round" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></svg>
                </span>
                {t("serviceDelivery")}
              </li>
              <li className="flex items-center gap-3">
                <span className="kv-icon-tile !size-9 !rounded-[10px]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></svg>
                </span>
                {(() => {
                  const pay = enabledPaymentMethods();
                  const list = [pay.bit ? "Bit" : null, pay.paypal ? "PayPal" : null, pay.cash ? t("payCash") : null]
                    .filter(Boolean)
                    .join(" · ");
                  return list ? t("servicePayment", { methods: list }) : t("servicePaymentGeneric");
                })()}
              </li>
            </ul>

            <div className="mt-6 border-t border-rule">
              <Accordion summary={t("accordionDetails")} open>
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
                  <dt>{t("detailTeam")}</dt>
                  <dd className="text-ink">{team}</dd>
                  {leagueName ? (
                    <>
                      <dt>{t("detailLeague")}</dt>
                      <dd className="text-ink">{leagueName}</dd>
                    </>
                  ) : null}
                  <dt>{t("detailSeason")}</dt>
                  <dd className="text-ink">
                    <Season value={product.season} />
                  </dd>
                  <dt>{t("detailKit")}</dt>
                  <dd className="text-ink">{t(`kit.${product.kit}`)}</dd>
                  <dt>{t("detailVersions")}</dt>
                  <dd className="text-ink">
                    {isRetroSeason(product.season) ? t("retroBadge") : `${t("versionFan")} · ${t("versionPlayer")}`}
                  </dd>
                </dl>
              </Accordion>
              <Accordion summary={t("accordionSizing")}>
                {t("accordionSizingBody")}{" "}
                <Link href="/size-guide" className="font-semibold text-[#1f5cff] underline-offset-4 hover:underline">
                  {t("accordionSizingLink")}
                </Link>
              </Accordion>
              <Accordion summary={t("accordionShipping")}>
                {t("accordionShippingBody")}{" "}
                <Link href="/shipping" className="font-semibold text-[#1f5cff] underline-offset-4 hover:underline">
                  {t("readMore")}
                </Link>
              </Accordion>
              <Accordion summary={t("accordionReturns")}>
                {t("accordionReturnsBody")}{" "}
                <Link href="/returns" className="font-semibold text-[#1f5cff] underline-offset-4 hover:underline">
                  {t("readMore")}
                </Link>
              </Accordion>
            </div>
          </Reveal>
        </section>
      </ProductSleeveProvider>

      {related.length > 0 ? (
        <>
          <SectionHead
            eyebrow={t("related", { team })}
            action={
              <Link
                href={`/shop/${teamSlug}`}
                className="border-b border-rule pb-0.5 text-[13px] transition-colors hover:border-ink"
              >
                {tShop("eyebrow")}
              </Link>
            }
          />
          <section className="pb-14">
            <ProductGrid products={related} locale={locale} reveal />
          </section>
        </>
      ) : (
        <div className="pb-14">
          <Link href="/shop" className="text-sm text-ink-soft hover:text-ink">
            {tNav("shop")}
          </Link>
        </div>
      )}
    </Wrap>
  );
}

/**
 * The `<details>` accordion: hairline rows, +/– affordance.
 *
 * The two glyphs were a hard swap on open. They are now one glyph that
 * rotates: the vertical stroke of the "+" turns a quarter-turn into the "–",
 * which is a transform, runs at hover speed, and means the row never reflows.
 * The summary text lifts to ink on hover so the whole row reads as the target
 * it already was.
 */
function Accordion({
  summary,
  open = false,
  children,
}: {
  summary: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="kv-acc">
      <summary>
        {summary}
        <span aria-hidden className="kv-acc-icon">
          <span />
          <span />
        </span>
      </summary>
      <div className="kv-acc-body max-w-[60ch]">{children}</div>
    </details>
  );
}
