import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { priceFor } from "@/data/pricing";
import { Wrap } from "@/components/shared/PageLede";
import { titleFor } from "@/lib/product";
import { ShirtStage, type HeroShirt } from "./ShirtStage";
import { pickShirts } from "./shirts";

/**
 * Art direction, in order of preference. Three shirts everyone recognises,
 * with three different colour stories — red-and-black, white, red — so the
 * crossfade actually reads as a change of shirt.
 */
const A_SHIRTS = [
  "ac-milan-2025-26-home-shirt",
  "real-madrid-2025-26-home-shirt",
  "arsenal-2025-26-home-shirt",
] as const;

/**
 * HERO A — product-forward.
 *
 * The approved mockup's lineage: a split hero where the shirt is the largest
 * thing on the page and the type is sized to introduce it rather than to
 * compete with it. The headline sits at `.display-sm`, roughly half the
 * current home scale, which is what makes room for a 560px tile in the same
 * fold.
 *
 * On a phone the shirt is moved ABOVE the type (visually only — the h1 is
 * still first in the DOM, so the heading order and the reading order are
 * untouched). A 375px column that opens with three lines of copy sells
 * nothing; one that opens with the shirt does.
 *
 * One accent CTA. The second, quieter action that the current hero carries is
 * deliberately gone: this variant makes a single argument.
 */
export async function HeroA({
  locale,
  priority = false,
}: {
  locale: string;
  priority?: boolean;
}) {
  const t = await getTranslations("heroPreview.a");

  const shirts: HeroShirt[] = pickShirts(A_SHIRTS, 3).map((product) => ({
    handle: product.handle,
    image: product.image,
    title: titleFor(product, locale),
    // The "from" price, exactly as the cards state it: smallest size, Fan.
    price: priceFor(product.kind, "S", "fan"),
  }));

  return (
    // 76px is the sticky header. The hero owns one viewport and no more, so
    // the CTA is above the fold at every size.
    <section className="flex min-h-[calc(100svh-76px)] flex-col justify-center">
      <Wrap>
        <div className="grid items-center gap-8 py-8 wide:grid-cols-[0.92fr_1.08fr] wide:gap-16 wide:py-14">
          <div className="order-2 wide:order-none">
            <span className="mono-eyebrow">{t("eyebrow")}</span>
            {/* Two authored lines, each rising out of its own clip box.
                Transform only — this is still the LCP text and it paints at
                full opacity on the first frame. The trailing space keeps the
                heading's text content reading as a sentence for a screen
                reader and a crawler. */}
            <h1 className="display-sm mt-4 mb-6">
              {(["titleA", "titleB"] as const).map((key, index) => (
                <span key={key} className="line-mask">
                  <span
                    style={{ "--kv-delay": `${index * 90}ms` } as React.CSSProperties}
                  >
                    {t(key)}
                    {index === 0 ? " " : null}
                  </span>
                </span>
              ))}
            </h1>
            <p className="mb-8 max-w-[42ch] text-ink-soft">{t("sub")}</p>
            <Link href="/shop" className="btn">
              {t("cta")}
            </Link>
          </div>

          {/* The tile is a square, so its WIDTH is really a height budget, and
              this variant's one rule is that the CTA stays above the fold.
              Both caps are that rule expressed twice: 82% of the measure on a
              phone, where the shirt is stacked on top of the whole text block
              and a full-width square costs 60px of fold; and one viewport
              minus the header, the section padding and the caption row on a
              desktop, where a 1280×720 laptop would otherwise hand the tile
              the full 577px column. The tile hugs the type's own inline start
              on a phone and swings to the inline end beside it on a desktop,
              so the gutter always opens between the two, never around them. */}
          <div className="order-1 w-full max-w-[82%] justify-self-start wide:order-none wide:max-w-[calc(100svh-16rem)] wide:justify-self-end">
            <ShirtStage shirts={shirts} priority={priority} />
          </div>
        </div>
      </Wrap>
    </section>
  );
}
