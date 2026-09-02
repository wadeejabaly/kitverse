import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { byKind, getLeagues, getVisibleProducts } from "@/data/catalog";
import { priceFor } from "@/data/pricing";
import { HeroD } from "@/components/hero/HeroD";
import { Reveal } from "@/components/motion/Reveal";
import { ProductGrid } from "@/components/shop/ProductCard";
import { Figure, Price } from "@/components/shared/Money";
import { Wrap } from "@/components/shared/PageLede";
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
 * It opens on <HeroD/>: the Floodlight redesign, a stadium-at-night navy
 * stage scoped to the hero alone with the crest's electric blue lighting a
 * single shirt from behind (see "THE FLOODLIGHT HERO" in globals.css). That
 * navy stage is the ONE dark moment on the page, which is why the Fan/Player
 * explainer below it stays on the page ground rather than painting a second
 * navy band — two navy slabs in one scroll and neither is an event.
 *
 * After the hero it is a rhythm of one-idea sections separated by a lot of
 * air, and the leagues are a magazine index rather than a grid of boxes.
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
          The Floodlight stage. It is a complete component so that the hero
          can be swapped, compared or reverted without this page knowing
          anything about how it is built. See HeroD for the surface and the
          RTL/LTR mirroring reasoning. */}
      <HeroD locale={locale} priority />

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
          This is the single question every buyer arrives with, and it used to
          be answered on a full-bleed navy band. It is not any more: the hero
          plaque above is navy, and a page that paints the same slab twice in
          one scroll has spent the effect and emphasised nothing. So the
          section keeps its copy, its two-column split and its hairline-
          separated rows, and states them on the page ground.

          What that buys back: the prices return to --accent, which is where a
          price belongs everywhere else on the site, and the eyebrow returns
          to the section gold. Both were suppressed inside the band because
          neither colour survives on it. The emphasis now comes from the air
          around the section and the size of the headline, which is the way
          every other section on this page carries weight. */}
      <Wrap>
        <section className="border-t border-rule pt-10 pb-[clamp(72px,11vw,140px)]">
          <div className="grid gap-12 wide:grid-cols-[0.9fr_1.1fr] wide:gap-20">
            <div>
              <span className="mono-eyebrow">{t("explainer.eyebrow")}</span>
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
                  className="border-t border-rule py-8 first:border-t-0 first:pt-0"
                >
                  <div className="mb-3 flex items-baseline justify-between gap-4">
                    <h3 className="text-[clamp(1.15rem,2vw,1.6rem)] font-medium">
                      {t(`explainer.${version}Title`)}
                    </h3>
                    <span className="text-[15px] text-accent">
                      {/* Illustrative, not a real product — any non-retro
                          season prices Fan/Player the same flat way. */}
                      <Price value={priceFor("2026/27", "S", version)} />
                    </span>
                  </div>
                  <p className="max-w-[48ch] text-sm text-ink-soft">
                    {t(`explainer.${version}Body`)}
                  </p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>
      </Wrap>

      {/* ─────────── LEAGUES, AS AN INDEX ───────────
          Full-width hairline rows: an oversized mono number, the league name
          at display scale, the count at the end. Hover steps the name toward
          the inline start and draws a gold hairline under the row. The number
          is the only ornament, and it is information.

          The oversized top padding and the missing hairline here were both
          the band's doing — the section had to push away from a full-bleed
          edge that no longer exists, and a rule against that edge would have
          read as part of it. With the explainer back on the ground, this
          section rejoins the page's rhythm. */}
      {leagues.length > 0 ? (
        <Wrap>
          <section className="border-t border-rule pt-10 pb-[clamp(72px,11vw,140px)]">
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
