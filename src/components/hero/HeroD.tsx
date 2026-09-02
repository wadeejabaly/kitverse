import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { priceFor } from "@/data/pricing";
import { Wrap } from "@/components/shared/PageLede";
import { Price } from "@/components/shared/Money";
import { titleFor } from "@/lib/product";
import { FloodStage, type FloodShirt } from "./FloodStage";
import { pickShirts } from "./shirts";

/**
 * Art direction, in order of preference. Arsenal opens the stage, followed by
 * two shirts with a different colour story each, so the crossfade reads as a
 * change of shirt rather than a change of crop.
 */
const D_SHIRTS = [
  "arsenal-2025-26-home-shirt",
  "real-madrid-2025-26-home-shirt",
  "ac-milan-2025-26-home-shirt",
] as const;

/**
 * HERO D — FLOODLIGHT. THE HOME PAGE HERO.
 *
 * A stadium-at-night mood scoped entirely to this section: deep navy ground,
 * an ambient corner wash, a diagonal light beam, and the crest's electric blue
 * lighting a single shirt from behind. See "THE FLOODLIGHT HERO" in
 * globals.css for the surface. It is the one place on the site that colour
 * appears outside the badge artwork, and nothing below the hero changes.
 *
 * Structurally this is Variant A's product-forward split — headline on one
 * side, one large shirt on the other, the whole argument above the fold at
 * every width — kept because that layout is not what changed. What changed is
 * the surface it sits on, and the copy source: this reads from `home.hero`,
 * the namespace <HeroB/> used, because it is the storefront's opening line and
 * not a pitch.
 *
 * <HeroA/>, <HeroB/> and <HeroC/> stay live on /hero-preview for reference;
 * this is the one promoted onto the home page. The Floodlight stage is now the
 * page's single navy moment — HeroB's plaque left the home page with it, so
 * there is exactly one dark surface in the scroll, as before.
 */
export async function HeroD({
  locale,
  priority = false,
}: {
  locale: string;
  priority?: boolean;
}) {
  const t = await getTranslations("home.hero");
  const tProduct = await getTranslations("product");

  const shirts: FloodShirt[] = pickShirts(D_SHIRTS, 3).map((product) => ({
    handle: product.handle,
    image: product.image,
    title: titleFor(product, locale),
    // The "from" price, exactly as the cards state it: smallest size, Fan.
    price: priceFor(product.season, "S", "fan"),
  }));

  // Illustrative, not a real product — the small print beside the CTA, the
  // same convention the Fan/Player explainer further down the page uses: any
  // non-retro season prices Fan and Player the same flat way.
  const fanFrom = priceFor("2026/27", "S", "fan");
  const playerFrom = priceFor("2026/27", "S", "player");

  return (
    // 76px is the sticky header. The hero owns one viewport and no more, so the
    // CTA is above the fold at every size.
    <section className="kv-flood relative flex min-h-[calc(100svh-76px)] flex-col justify-center overflow-hidden">
      <div aria-hidden className="kv-flood-glow" />
      <div aria-hidden className="kv-flood-beam" />

      <Wrap className="relative">
        <div className="grid items-center gap-10 py-10 wide:grid-cols-[1.02fr_0.98fr] wide:gap-14 wide:py-16">
          <div className="order-2 wide:order-none">
            <span className="mono-eyebrow kv-flood-eyebrow">{t("eyebrow")}</span>
            {/* Two authored lines, each rising out of its own clip box —
                transform only, since this is the LCP text and it has to paint
                at full opacity on the first frame. Only the second line takes
                the gradient treatment: one line stays plain ink so the
                gradient reads as an accent, not as decoration on every word. */}
            <h1 className="display-sm mt-4 mb-6">
              {(["titleA", "titleB"] as const).map((key, index) => (
                <span key={key} className="line-mask">
                  <span
                    className={index === 1 ? "kv-flood-gradient-text" : undefined}
                    style={{ "--kv-delay": `${index * 90}ms` } as React.CSSProperties}
                  >
                    {t(key)}
                    {index === 0 ? " " : null}
                  </span>
                </span>
              ))}
            </h1>
            <p className="kv-flood-sub mb-8 max-w-[36ch]">{t("sub")}</p>
            <div className="flex flex-wrap items-center gap-6">
              <Link href="/shop" className="btn btn-flood">
                {t("cta")}
              </Link>
              <span className="kv-flood-sub text-[13px]">
                {tProduct("versionFan")}{" "}
                <Price value={fanFrom} className="kv-flood-strong" />
                {" · "}
                {tProduct("versionPlayer")}{" "}
                <Price value={playerFrom} className="kv-flood-strong" />
              </span>
            </div>
          </div>

          {/* Same fold-safety budget as Variant A: 82% of the measure on a
              phone, where the shirt stacks above the whole text block, and one
              viewport minus the header/padding/caption on a desktop. */}
          <div className="order-1 w-full max-w-[82%] justify-self-start wide:order-none wide:max-w-[calc(100svh-16rem)] wide:justify-self-end">
            <FloodStage shirts={shirts} priority={priority} />
          </div>
        </div>
      </Wrap>
    </section>
  );
}
