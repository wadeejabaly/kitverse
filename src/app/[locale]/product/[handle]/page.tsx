import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/config";
import { getLeagues, getProduct, getVisibleProducts } from "@/data/catalog";
import { priceFor } from "@/data/pricing";
import { slugify } from "@/data/slug";
import { Reveal } from "@/components/motion/Reveal";
import { ProductForm } from "@/components/product/ProductForm";
import { ProductGrid } from "@/components/shop/ProductCard";
import { Season } from "@/components/shared/Money";
import { SectionHead, Wrap } from "@/components/shared/PageLede";
import { teamFor, titleFor } from "@/lib/product";
import { alternatesFor, localeUrl } from "@/lib/site";

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
  const leagueName = league ? (locale === "ar" ? league.nameAr : league.name) : null;

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

      <nav aria-label={t("breadcrumbShop")} className="pt-6">
        <span className="mono-eyebrow text-ink-soft">
          <Link href="/shop" className="transition-colors hover:text-ink">
            {t("breadcrumbShop")}
          </Link>
          {leagueName ? (
            <>
              <span aria-hidden className="mx-2">
                ·
              </span>
              <Link
                href={`/shop/${product.league}`}
                className="transition-colors hover:text-ink"
              >
                {leagueName}
              </Link>
            </>
          ) : null}
          <span aria-hidden className="mx-2">
            ·
          </span>
          <Link href={`/shop/${teamSlug}`} className="transition-colors hover:text-ink">
            {team}
          </Link>
        </span>
      </nav>

      <section className="grid items-start gap-10 pt-8 pb-10 wide:grid-cols-2 wide:gap-14">
        {/* One photograph per product today; the tile is sticky so the buy box
            can scroll past it on tall screens.

            No reveal on the gallery: it is the LCP element on this page, and
            an entrance on the thing the reader came to see is the one place
            where motion costs more than it gives. The details column opposite
            carries the entrance instead, 90ms behind the fold — enough to
            read as "the page settled", not as a curtain. */}
        <div className="wide:sticky wide:top-24">
          <div className="grid aspect-square place-items-center bg-tile">
            <Image
              src={product.image}
              alt={title}
              width={2048}
              height={2048}
              priority
              sizes="(max-width: 900px) 100vw, 560px"
              className="h-auto w-[90%]"
            />
          </div>
        </div>

        <Reveal delay={90}>
          <span className="mono-eyebrow text-ink-soft">
            {team}
            <span aria-hidden className="mx-2">
              ·
            </span>
            <Season value={product.season} />
          </span>
          <h1 className="mt-2.5 mb-1.5 text-[28px] leading-tight">{title}</h1>

          <ProductForm handle={product.handle} season={product.season} />

          <div className="mt-8 border-t border-rule">
            <Accordion summary={t("accordionShipping")} open>
              {t("accordionShippingBody")}
            </Accordion>
            <Accordion summary={t("accordionReturns")}>
              {t("accordionReturnsBody")}
            </Accordion>
            <Accordion summary={t("accordionSizing")}>
              {t("accordionSizingBody")}{" "}
              <Link
                href="/size-guide"
                className="text-ink underline underline-offset-4"
              >
                {t("accordionSizingLink")}
              </Link>
            </Accordion>
          </div>
        </Reveal>
      </section>

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
    <details open={open} className="group border-b border-rule">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-sm text-ink-soft transition-colors duration-200 group-open:text-ink hover:text-ink [&::-webkit-details-marker]:hidden">
        {summary}
        {/* Grid-cell stacking rather than absolute offsets: the two strokes
            share one centred cell, so there is no physical left/top anywhere
            and the glyph is identical in both directions. */}
        <span
          aria-hidden
          className="grid size-3 shrink-0 place-items-center text-ink-soft"
        >
          <span className="col-start-1 row-start-1 h-px w-3 bg-current" />
          <span className="col-start-1 row-start-1 h-3 w-px bg-current transition-transform duration-300 ease-out group-open:rotate-90" />
        </span>
      </summary>
      <div className="max-w-[52ch] pb-5 text-sm text-ink-soft">{children}</div>
    </details>
  );
}
