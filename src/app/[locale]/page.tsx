import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { byKind, getLeagues, getVisibleProducts } from "@/data/catalog";
import { priceFor } from "@/data/pricing";
import { ProductGrid } from "@/components/shop/ProductCard";
import { Figure, Price } from "@/components/shared/Money";
import { SectionHead, Wrap } from "@/components/shared/PageLede";
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
 * Home — quiet editorial, in the mockup's order: hero, season groups, new in,
 * the Fan/Player explainer, and a numbered strip of how we work.
 *
 * Everything is driven off getVisibleProducts(), so the page composes itself
 * around whatever has cleared image review. With a handful of products it
 * reads as a considered edit; at a few hundred nothing about it changes.
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
  const hero = visible[0];

  // Only leagues that can actually show something — a "0" next to a league
  // name is a dead end, not information.
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
    <Wrap>
      {/* Hero — text carries it; the single tile is the newest approved
          shirt rather than art we'd have to commission. */}
      <section className="grid items-center gap-10 py-14 wide:grid-cols-[1.05fr_1fr] wide:gap-14">
        <div>
          <span className="mono-eyebrow text-ink-soft">{t("eyebrow")}</span>
          <h1 className="mt-3.5 mb-4 text-[clamp(2rem,3.6vw,3.1rem)] leading-[1.08]">
            {t("title")}
          </h1>
          <p className="mb-7 max-w-[42ch] text-ink-soft">{t("intro")}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/shop" className="btn">
              {t("heroCta")}
            </Link>
            <Link href="/shop/national-teams" className="btn btn-quiet">
              {t("heroSecondary")}
            </Link>
          </div>
        </div>
        {hero ? (
          <Link
            href={`/product/${hero.handle}`}
            className="group grid aspect-square place-items-center overflow-hidden bg-tile"
          >
            <Image
              src={hero.image}
              alt={titleFor(hero, locale)}
              width={1200}
              height={1200}
              priority
              sizes="(max-width: 900px) 100vw, 560px"
              className="h-auto w-[88%] transition-transform duration-300 ease-out group-hover:scale-[1.03]"
            />
          </Link>
        ) : null}
      </section>

      {/* Season groups — the three ways into the catalogue. */}
      {kinds.length > 0 ? (
        <>
          <SectionHead eyebrow={t("browseEyebrow")} />
          <section className="mb-14 grid gap-px border border-rule bg-rule wide:grid-cols-3">
            {kinds.map(({ kind, count }) => (
              <Link
                key={kind}
                href={kindHref[kind]}
                className="flex flex-col gap-2 bg-ground p-6 transition-colors hover:bg-chip"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <strong className="text-[15px] font-medium">
                    {t(`kinds.${kind}.title`)}
                  </strong>
                  <span className="mono-eyebrow latin text-ink-soft">
                    <Figure>{count}</Figure>
                  </span>
                </span>
                <span className="text-sm text-ink-soft">{t(`kinds.${kind}.body`)}</span>
              </Link>
            ))}
          </section>
        </>
      ) : null}

      {/* New in. */}
      {newIn.length > 0 ? (
        <>
          <SectionHead
            eyebrow={t("newIn")}
            action={
              <Link
                href="/shop"
                className="border-b border-rule pb-0.5 text-[13px] transition-colors hover:border-ink"
              >
                {tCommon("viewAll")}
              </Link>
            }
          />
          <section className="pb-14">
            <ProductGrid products={newIn} locale={locale} priorityCount={4} />
          </section>
        </>
      ) : (
        <section className="border-t border-rule py-16">
          <p className="max-w-[46ch] text-ink-soft">{t("empty")}</p>
        </section>
      )}

      {/* Shop by league. */}
      {leagues.length > 0 ? (
        <>
          <SectionHead eyebrow={t("leaguesEyebrow")} />
          <section className="mb-14 grid gap-px border border-rule bg-rule wide:grid-cols-3">
            {leagues.map((league) => (
              <Link
                key={league.slug}
                href={`/shop/${league.slug}`}
                className="flex items-baseline justify-between gap-3 bg-ground px-6 py-6 transition-colors hover:bg-chip"
              >
                <strong className="text-[15px] font-medium">
                  {locale === "ar" ? league.nameAr : league.name}
                </strong>
                <span className="mono-eyebrow latin text-ink-soft">
                  <Figure>{league.count}</Figure>
                </span>
              </Link>
            ))}
          </section>
        </>
      ) : null}

      {/* Fan vs Player — the single most asked question, answered before it
          is asked. Two columns of plain prose, no imagery. */}
      <section className="grid gap-10 border-t border-rule py-14 wide:grid-cols-2 wide:gap-14">
        <div>
          <span className="mono-eyebrow text-ink-soft">{t("explainer.eyebrow")}</span>
          <h2 className="mt-3 text-[22px]">{t("explainer.title")}</h2>
        </div>
        <div className="flex flex-col gap-7">
          <div>
            <h3 className="mb-2 flex items-baseline gap-3 text-[15px]">
              {t("explainer.fanTitle")}
              <span className="text-accent">
                <Price value={priceFor("current", "S", "fan")} />
              </span>
            </h3>
            <p className="max-w-[46ch] text-sm text-ink-soft">{t("explainer.fanBody")}</p>
          </div>
          <div>
            <h3 className="mb-2 flex items-baseline gap-3 text-[15px]">
              {t("explainer.playerTitle")}
              <span className="text-accent">
                <Price value={priceFor("current", "S", "player")} />
              </span>
            </h3>
            <p className="max-w-[46ch] text-sm text-ink-soft">
              {t("explainer.playerBody")}
            </p>
          </div>
        </div>
      </section>

      {/* Numbered value strip. */}
      <section className="grid gap-11 border-t border-rule pt-11 pb-16 wide:grid-cols-3">
        {(["one", "two", "three"] as const).map((key, index) => (
          <div key={key}>
            <span className="mono-eyebrow latin text-ink-soft">
              <Figure>{String(index + 1).padStart(2, "0")}</Figure>
            </span>
            <h3 className="mt-2.5 mb-2 text-[15px]">{t(`values.${key}.title`)}</h3>
            <p className="max-w-[34ch] text-sm text-ink-soft">{t(`values.${key}.body`)}</p>
          </div>
        ))}
      </section>
    </Wrap>
  );
}
