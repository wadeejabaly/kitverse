import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { isRetroSeason, priceFor } from "@/data/pricing";
import type { Product } from "@/data/types";
import { Reveal } from "@/components/motion/Reveal";
import { Price, Season } from "@/components/shared/Money";
import { hasPhoto, shortSeason, teamFor, titleFor } from "@/lib/product";

/**
 * The product card from the mockup: a square photo on a white tile, the title,
 * then a baseline-aligned meta row of season (mono, Latin-only treatment) and
 * price (accent). Hover scales the image 1.03 and, as of 2026-10-25 (the
 * site's bolder, more athletic-brand direction), draws an electric-blue
 * frame around the tile and shifts the price into the same colour — the
 * same underline-draw mechanic the magazine index rows already use
 * elsewhere, here as a ring instead of a line since the target is a square
 * tile, not a row of text.
 *
 * This card is the one shared by every listing page on the site (shop, each
 * league, retro, national teams, search, new/last season), so this one
 * change is what carries the bolder direction across all of them without
 * touching each page.
 *
 * Deliberately not a server component — the search page renders the same card
 * from the client, so it takes `locale` as a prop instead of reaching for
 * request context.
 */
export function ProductCard({
  product,
  locale,
  priority = false,
}: {
  product: Product;
  locale: string;
  priority?: boolean;
}) {
  const t = useTranslations("common");
  const title = titleFor(product, locale);
  const team = teamFor(product, locale);
  const retro = isRetroSeason(product.season);
  // The "from" price exactly as before: smallest size, Fan (Retro has one
  // price whatever the version). From the price list, never hardcoded.
  const price = priceFor(product.season, "S", "fan");
  const inStock = hasPhoto(product.image);

  // Redesign phase 2 (2026-11-09): a white card with a soft studio tile,
  // team eyebrow, bold title, a badge for the line (Retro / National team)
  // and a "View shirt" bar that rises on hover. The photo is never cropped:
  // object-contain inside a square at 86%, as before.
  const badge = retro ? t("badgeRetro") : product.kind === "national" ? t("badgeNational") : null;

  return (
    <Link href={`/product/${product.handle}`} className="kv-pcard group text-start">
      <div className="kv-pcard-media">
        {inStock ? (
          <Image
            src={product.image}
            alt={title}
            width={900}
            height={900}
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 900px) 33vw, 280px"
            className="h-auto w-[86%] mix-blend-multiply transition-transform duration-500 ease-out group-hover:scale-[1.05]"
          />
        ) : (
          <span className="mono-eyebrow text-ink-soft">{t("outOfStock")}</span>
        )}
        {badge ? (
          <span className={`kv-pcard-badge${retro ? " kv-pcard-badge--gold" : ""}`}>{badge}</span>
        ) : null}
        <span aria-hidden className="kv-pcard-cta">
          {t("viewShirt")}
        </span>
      </div>
      <div className="kv-pcard-body">
        <span className="kv-pcard-team">{team}</span>
        <h3 className="kv-pcard-title">{title}</h3>
        <div className="kv-pcard-foot">
          <span>
            <span className="kv-pcard-from">{t("from")}</span>
            <Price value={price} className="kv-pcard-price" />
          </span>
          <span className="kv-pcard-meta">
            <Season value={shortSeason(product.season)} />
            <br />
            {retro ? t("retroLine") : t("fanPlayer")}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({
  products,
  locale,
  columns = 4,
  priorityCount = 0,
  reveal = false,
}: {
  products: Product[];
  locale: string;
  columns?: 3 | 4;
  priorityCount?: number;
  reveal?: boolean;
}) {
  const className =
    columns === 3
      ? "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5"
      : "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 wide:grid-cols-4";

  const cards = products.map((product, index) => (
    <ProductCard
      key={product.handle}
      product={product}
      locale={locale}
      priority={index < priorityCount}
    />
  ));

  if (reveal) {
    return (
      <Reveal stagger={70} className={className}>
        {cards}
      </Reveal>
    );
  }

  return <div className={className}>{cards}</div>;
}
