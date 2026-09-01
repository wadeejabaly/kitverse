import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { byKind, getLeagues, getVisibleProducts } from "@/data/catalog";
import { priceFor } from "@/data/pricing";
import { Parallax } from "@/components/motion/Parallax";
import { Reveal } from "@/components/motion/Reveal";
import { ProductGrid } from "@/components/shop/ProductCard";
import { Figure, Price } from "@/components/shared/Money";
import { Wrap } from "@/components/shared/PageLede";
import { titleFor } from "@/lib/product";
import { alternatesFor } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    description: t("description"),
    alternates: alternatesFor(locale, "/"),
  };
}

/**
 * Home — the statement page.
 *
 * The composition is editorial rather than retail: an asymmetric type-led
 * hero, then a rhythm of one-idea sections separated by a lot of air. The
 * only full-bleed surface on the site sits in the middle of it, carrying the
 * one question every buyer arrives with (Fan or Player), and the leagues are
 * a magazine index rather than a grid of boxes.
 *
 * Nothing here is decoration: every section is type, space, and the product
 * photography. Everything is still driven off getVisibleProducts(), so the
 * page composes itself around whatever has cleared image review.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const tCommon = await getTranslations("common");

  const visible = getVisibleProducts();
  const newIn = visible.slice(0, 8);
  // The hero composition wants two shirts that do not look like the same
  // shirt twice; taking them from opposite ends of the approved set is the
  // cheapest way to get contrast without art-directing anything.
  const heroPrimary = visible[0];
  const heroSecondary = visible.length > 3 ? visible[3] : visible[1];

  const leagues = getLeagues()
    .map((league) => ({
      ...league,
      count: visible.filter((product) => product.league === league.slug).length,
    }))
    .filter((league) => league.count > 0);

  const kinds = (["national", "current", "previous"] as const)
    .map((kind) => ({ kind, count: byKind(kind).length }))
    .filter((entry) => entry.count > 0);

  const kindHref = {
    national: "/shop/national-teams",
    current: "/shop/new-season",
    previous: "/shop/last-season",
  } as const;

  return (
    <>
      {/* ─────────── HERO ───────────
          Type is the hero. The headline is deliberately the largest thing on
          the page and it is real text, so it is also the LCP element — which
          is why its entrance is a translate inside a clip box and never an
          opacity fade. It paints at full opacity on the first frame and then
          rises. The lines are authored as three separate messages because a
          display headline's breaks are a design decision, not a consequence
          of the viewport width. */}
      <Wrap>
        <section className="pt-[clamp(40px,7vw,88px)] pb-[clamp(72px,11vw,140px)]">
          {/* The headline takes the FULL measure rather than a column.
              At 84px, "with your name on it." does not fit in a 640px column
              and breaks to a fourth line — which turns three authored line
              breaks into an accident. Across the full 1132px it sets as
              written, in both locales, and the type stops competing with the
              photography for width. The asymmetry moves down into the row
              below it, where it costs nothing. */}
          <div>
            <span className="mono-eyebrow">{t("eyebrow")}</span>
            <h1 className="display mt-5 mb-10">
              {(["titleA", "titleB", "titleC"] as const).map((key, index) => (
                <span key={key} className="line-mask">
                  <span style={{ "--kv-delay": `${index * 90}ms` } as React.CSSProperties}>
                    {/* The trailing space is not cosmetic. These are block
                        boxes, so it collapses to nothing on screen — but
                        without it the heading's text content reads
                        "shirt,in your size,with", which is what a screen
                        reader announces and what a crawler indexes. */}
                    {t(key)}
                    {index < 2 ? " " : null}
                  </span>
                </span>
              ))}
            </h1>
          </div>

          <div className="grid items-center gap-12 wide:grid-cols-[1fr_0.95fr] wide:gap-16">
            <div>
              <p className="mb-9 max-w-[44ch] text-ink-soft">{t("intro")}</p>
              <div className="flex flex-wrap gap-3">
                <Link href="/shop" className="btn">
                  {t("heroCta")}
                </Link>
                <Link href="/shop/national-teams" className="btn btn-quiet">
                  {t("heroSecondary")}
                </Link>
              </div>
            </div>

            {/* The quiet composition. Two tiles at different sizes and
                different parallax speeds — 10% and 26% — so the pair separates
                in depth as the page moves. Absolutely positioned with logical
                insets, so Arabic mirrors the whole arrangement with no
                direction-specific rule. On phones the second tile is dropped
                rather than shrunk: a composition that small is just clutter.

                The absolute arrangement is a DESKTOP one: on a phone the
                aspect box would only reserve empty air around a single tile,
                so below `wide` the primary tile is a plain block at 80% of the
                measure — the asymmetric gap without the void. */}
            {heroPrimary ? (
              <div className="relative w-full wide:aspect-[3/2]">
                <Parallax
                  speed={0.1}
                  className="w-[80%] wide:absolute wide:start-0 wide:top-0 wide:w-[60%]"
                >
                  <Link
                    href={`/product/${heroPrimary.handle}`}
                    className="group grid aspect-square place-items-center overflow-hidden bg-tile"
                  >
                    <Image
                      src={heroPrimary.image}
                      alt={titleFor(heroPrimary, locale)}
                      width={1000}
                      height={1000}
                      priority
                      sizes="(max-width: 900px) 80vw, 330px"
                      className="h-auto w-[88%] transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                    />
                  </Link>
                </Parallax>

                {heroSecondary && heroSecondary.handle !== heroPrimary.handle ? (
                  <Parallax
                    speed={0.26}
                    className="absolute end-0 bottom-0 hidden w-[44%] wide:block"
                  >
                    <Link
                      href={`/product/${heroSecondary.handle}`}
                      className="group grid aspect-square place-items-center overflow-hidden bg-tile"
                    >
                      <Image
                        src={heroSecondary.image}
                        alt={titleFor(heroSecondary, locale)}
                        width={700}
                        height={700}
                        sizes="240px"
                        className="h-auto w-[86%] transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                      />
                    </Link>
                  </Parallax>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </Wrap>

      {/* ─────────── THE THREE WAYS IN ───────────
          Was a bordered three-up box grid. Boxes are what a store template
          reaches for; here the hairline above the row and the space between
          the columns do the same job, and the type carries the hierarchy. */}
      {kinds.length > 0 ? (
        <Wrap>
          <Reveal
            as="section"
            stagger={80}
            className="grid gap-10 border-t border-rule pt-10 pb-[clamp(72px,11vw,140px)] wide:grid-cols-3 wide:gap-14"
          >
            {kinds.map(({ kind, count }) => (
              <Link key={kind} href={kindHref[kind]} className="group block text-start">
                <span className="mono-eyebrow latin text-ink-soft">
                  <Figure>{count}</Figure>
                </span>
                <h2 className="mt-3 mb-2 text-[clamp(1.1rem,1.7vw,1.4rem)]">
                  <span className="underline-draw">{t(`kinds.${kind}.title`)}</span>
                </h2>
                <p className="max-w-[34ch] text-sm text-ink-soft">
                  {t(`kinds.${kind}.body`)}
                </p>
              </Link>
            ))}
          </Reveal>
        </Wrap>
      ) : null}

      {/* ─────────── NEW IN ───────────
          The products are the idea, so the section carries no headline of its
          own — just its label and the way out. */}
      {newIn.length > 0 ? (
        <Wrap>
          <section className="pb-[clamp(72px,11vw,140px)]">
            <div className="mb-9 flex items-baseline justify-between gap-4 border-t border-rule pt-6">
              <span className="mono-eyebrow">{t("newIn")}</span>
              <Link
                href="/shop"
                className="border-b border-rule pb-0.5 text-[13px] transition-colors hover:border-ink"
              >
                {tCommon("viewAll")}
              </Link>
            </div>
            <ProductGrid products={newIn} locale={locale} priorityCount={4} reveal />
          </section>
        </Wrap>
      ) : (
        <Wrap>
          <section className="border-t border-rule py-16">
            <p className="max-w-[46ch] text-ink-soft">{t("empty")}</p>
          </section>
        </Wrap>
      )}

      {/* ─────────── FAN OR PLAYER ───────────
          The one full-bleed surface on the site. It exists because this is the
          single question every buyer arrives with, and giving it the whole
          width is the page saying so. Accent ground, accent-ink type, hairlines
          in the band's own ink, and a paper grain at 5%. */}
      <section className="band">
        <Wrap>
          <div className="grid gap-12 py-[clamp(76px,12vw,160px)] wide:grid-cols-[0.9fr_1.1fr] wide:gap-20">
            <div>
              <span className="mono-eyebrow band-soft">{t("explainer.eyebrow")}</span>
              <h2 className="display-sm mt-5">
                <span className="line-mask">
                  <span>{t("explainer.title")}</span>
                </span>
              </h2>
            </div>

            <Reveal stagger={90} className="flex flex-col">
              {(["fan", "player"] as const).map((version) => (
                <div
                  key={version}
                  className="border-t band-rule py-8 first:border-t-0 first:pt-0"
                >
                  <div className="mb-3 flex items-baseline justify-between gap-4">
                    <h3 className="text-[clamp(1.15rem,2vw,1.6rem)] font-medium">
                      {t(`explainer.${version}Title`)}
                    </h3>
                    {/* The price stays in the band's own ink: --accent is the
                        ground here, so the usual accent-coloured price would
                        be invisible against it. */}
                    <span className="text-[15px]">
                      <Price value={priceFor("current", "S", version)} />
                    </span>
                  </div>
                  <p className="max-w-[48ch] text-sm band-soft">
                    {t(`explainer.${version}Body`)}
                  </p>
                </div>
              ))}
            </Reveal>
          </div>
        </Wrap>
      </section>

      {/* ─────────── LEAGUES, AS AN INDEX ───────────
          Full-width hairline rows: an oversized mono number, the league name
          at display scale, the count at the end. Hover steps the name toward
          the inline start and draws a gold hairline under the row. The number
          is the only ornament, and it is information. */}
      {leagues.length > 0 ? (
        <Wrap>
          <section className="pt-[clamp(76px,12vw,160px)] pb-[clamp(72px,11vw,140px)]">
            <span className="mono-eyebrow">{t("leaguesEyebrow")}</span>
            <Reveal stagger={60} className="mt-8 border-b border-rule">
              {leagues.map((league, index) => (
                <Link
                  key={league.slug}
                  href={`/shop/${league.slug}`}
                  className="index-row group"
                >
                  <span className="index-figure text-[clamp(0.95rem,1.7vw,1.35rem)] text-ink-soft">
                    <Figure>{String(index + 1).padStart(2, "0")}</Figure>
                  </span>
                  <span className="index-row-name text-[clamp(1.25rem,3.2vw,2.15rem)] leading-tight font-medium">
                    {locale === "ar" ? league.nameAr : league.name}
                  </span>
                  <span className="index-figure text-[13px] text-ink-soft">
                    <Figure>{league.count}</Figure>
                  </span>
                </Link>
              ))}
            </Reveal>
          </section>
        </Wrap>
      ) : null}

      {/* ─────────── HOW WE WORK ───────────
          Oversized numerals carry the rhythm. The eyebrow that names this
          section already existed in the message files and had never been
          rendered. */}
      <Wrap>
        <section className="border-t border-rule pt-10 pb-[clamp(88px,13vw,170px)]">
          <span className="mono-eyebrow">{t("valuesEyebrow")}</span>
          <Reveal
            stagger={80}
            className="mt-10 grid gap-12 wide:grid-cols-3 wide:gap-16"
          >
            {(["one", "two", "three"] as const).map((key, index) => (
              <div key={key}>
                {/* Watermark ordinal: rhythm, not content. The list order
                    already carries the sequence, so this is aria-hidden and
                    sits below text contrast on purpose — see .ghost-figure. */}
                <span aria-hidden className="ghost-figure block">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-6 mb-2.5 text-[17px]">{t(`values.${key}.title`)}</h3>
                <p className="max-w-[34ch] text-sm text-ink-soft">
                  {t(`values.${key}.body`)}
                </p>
              </div>
            ))}
          </Reveal>
        </section>
      </Wrap>
    </>
  );
}
