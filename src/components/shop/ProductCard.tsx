import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { compareAtFor, priceFor } from "@/data/pricing";
import type { Product } from "@/data/types";
import { ComparePrice, Price, Season } from "@/components/shared/Money";
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
  const title = titleFor(product, locale);
  // The "from" price: smallest size, Fan version. Selections on the PDP move it.
  const price = priceFor(product.kind, "S", "fan");
  const compareAt = compareAtFor(product.kind, "S", "fan");

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
        <span className="mono-eyebrow latin text-ink-soft">
          <Season value={shortSeason(product.season)} />
        </span>
        {/* Live price leads, the struck compare-at follows it — the order
            retail readers expect, and it mirrors correctly in RTL because
            flex order is logical, not physical. */}
        <span className="flex items-baseline gap-2 text-sm text-accent">
          <Price value={price} />
          {compareAt === null ? null : <ComparePrice value={compareAt} className="text-xs" />}
        </span>
      </div>
    </Link>
  );
}

/** The 4-up / 3-up / 2-up grid every listing on the site uses. */
export function ProductGrid({
  products,
  locale,
  columns = 4,
  priorityCount = 0,
}: {
  products: Product[];
  locale: string;
  columns?: 3 | 4;
  priorityCount?: number;
}) {
  return (
    <div
      className={
        columns === 3
          ? "grid grid-cols-2 gap-5 sm:grid-cols-3"
          : "grid grid-cols-2 gap-5 sm:grid-cols-3 wide:grid-cols-4"
      }
    >
      {products.map((product, index) => (
        <ProductCard
          key={product.handle}
          product={product}
          locale={locale}
          priority={index < priorityCount}
        />
      ))}
    </div>
  );
}
