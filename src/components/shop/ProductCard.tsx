import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { priceFor } from "@/data/pricing";
import type { Product } from "@/data/types";
import { Reveal } from "@/components/motion/Reveal";
import { Price, Season } from "@/components/shared/Money";
import { shortSeason, titleFor } from "@/lib/product";

/**
 * The product card from the mockup: a square photo on a white tile, the title,
 * then a baseline-aligned meta row of season (mono, Latin-only treatment) and
 * price (accent). Hover scales the image 1.03 and nothing else moves.
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
  // The "from" price: smallest size, Fan version — or the single Retro price
  // for a 2022-and-earlier season, since priceFor ignores "fan" there.
  // Selections on the PDP move it.
  const price = priceFor(product.season, "S", "fan");

  return (
    <Link href={`/product/${product.handle}`} className="group block text-start">
      <div className="mb-3.5 grid aspect-square place-items-center overflow-hidden bg-tile">
        <Image
          src={product.image}
          alt={title}
          width={900}
          height={900}
          priority={priority}
          sizes="(max-width: 640px) 50vw, (max-width: 900px) 33vw, 280px"
          className="h-auto w-[86%] transition-transform duration-300 ease-out group-hover:scale-[1.03]"
        />
      </div>
      <h3 className="mb-1 text-sm font-normal">{title}</h3>
      <div className="flex items-baseline justify-between gap-2.5">
        {/* The season label and the invitation occupy the same cell and cross-
            fade on hover: the card gains a second state without gaining a
            line, so no row in the grid shifts. Both are laid out (grid-area
            stacking, not absolute positioning), so the cell is always as wide
            as the longer of the two and nothing reflows mid-transition.
            aria-hidden on the invitation — the whole card is already a link
            and "View shirt" would be a second, redundant announcement. */}
        <span className="grid text-ink-soft">
          <span className="mono-eyebrow latin col-start-1 row-start-1 text-ink-soft transition-opacity duration-300 ease-out group-hover:opacity-0">
            <Season value={shortSeason(product.season)} />
          </span>
          <span
            aria-hidden
            className="mono-eyebrow col-start-1 row-start-1 text-ink-soft opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100"
          >
            {t("viewShirt")}
          </span>
        </span>
        <span className="flex items-baseline gap-2 text-sm text-accent">
          <Price value={price} />
        </span>
      </div>
    </Link>
  );
}

/**
 * The 4-up / 3-up / 2-up grid every listing on the site uses.
 *
 * With `reveal`, the grid element itself becomes the reveal host so the
 * stagger lands on the CARDS rather than on the grid as one block — which is
 * the whole point of a staggered entrance. Wrapping a <Reveal> around this
 * component from outside would stagger a single child and look like no
 * stagger at all.
 */
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
      ? "grid grid-cols-2 gap-5 sm:grid-cols-3"
      : "grid grid-cols-2 gap-5 sm:grid-cols-3 wide:grid-cols-4";

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
