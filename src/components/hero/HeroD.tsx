import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { priceFor } from "@/data/pricing";
import { Parallax } from "@/components/motion/Parallax";
import { Wrap } from "@/components/shared/PageLede";
import { Price } from "@/components/shared/Money";
import { titleFor } from "@/lib/product";
import { FloodStage, type FloodShirt } from "./FloodStage";
import { HERO_CUTOUTS } from "./hero-cutouts";
import { pickShirts } from "./shirts";

/**
 * Art direction, in order of preference. Arsenal opens the stage, followed by
 * two shirts with a different colour story each, so the crossfade reads as a
 * change of shirt rather than a change of crop.
 *
 * Re-pointed to the 2026/27 handles on 2026-10-23: the catalog rebuild that
 * season cleared out the 2025/26 set these used to name, so pickShirts() had
 * been silently falling through to its alphabetical fallback instead of this
 * art direction — the fallback never breaks (see shirts.ts), but it was no
 * longer the three shirts this component claims to choose.
 */
const D_SHIRTS = [
  "arsenal-2026-27-home-shirt",
  "real-madrid-2026-27-home-shirt",
  "ac-milan-2026-27-home-shirt",
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
 *
 * Pushed further on 2026-10-23 (owner: "the best hero in the world"), all
 * cosmetic and all cheap — nothing here is a new JS dependency, a new
 * network request of real weight, or an animation a phone pays for:
 *
 *   - .kv-flood-display replaces .display-sm for this headline only — a
 *     bigger, bolder scale that belongs to Floodlight alone (see its own
 *     note in globals.css for why that is not the retired `.display` step
 *     coming back).
 *   - .kv-flood-grain is a fixed, inline-SVG noise texture painted last, so
 *     the gradients read as something with grain rather than a flat fill.
 *   - The ambient wash+beam and the shirt stage now sit in their own
 *     <Parallax/> at two different speeds (0.08 background, 0.18
 *     foreground) — real depth separation as the hero scrolls past, using
 *     the primitive already built "with the hero in mind" (see Parallax's
 *     own docstring) rather than new scroll-handling code.
 *   - The shirt's own glow breathes and the button has an idle pulse — both
 *     authored as symmetric keyframes in globals.css, which is what lets
 *     them skip a manual reduced-motion override entirely.
 *   - FloodStage itself gained a cursor tilt and a crest watermark; see its
 *     own docstring for both.
 */
export async function HeroD({
  locale,
  priority = false,
}: {
  locale: string;
  priority?: boolean;
}) {
  const t = await getTranslations("home.hero");

  const shirts: FloodShirt[] = pickShirts(D_SHIRTS, 3).map((product) => ({
    handle: product.handle,
    // The cutout when one exists for this handle (the art-directed D_SHIRTS
    // three, normally), else the product's own photo — see hero-cutouts.ts
    // for why this can never break.
    image: HERO_CUTOUTS[product.handle] ?? product.image,
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
    // 105px is the sticky header: 64px crest + 2×20px (py-5) padding + 1px
    // border-b (see Header.tsx). This was 76px before the crest doubled to
    // 64px on 2026-10-23 (32px crest + the same padding/border ≈ 76px) —
    // that resize never updated the figure here, so the hero ran 29px past
    // the real fold on every screen until this was caught and fixed
    // (2026-10-25). The hero owns one viewport and no more, so the CTA is
    // above the fold at every size — keep this in sync with Header.tsx.
    <section className="kv-flood relative flex min-h-[calc(100svh-105px)] flex-col justify-center overflow-hidden">
      {/* Background pair — the ambient corner wash and the diagonal beam —
          move together as one slow, distant layer (speed 0.08). The shirt
          stage below moves at 0.18: faster, because it is the foreground
          subject, so the gap between the two speeds is what reads as depth
          once the hero starts scrolling away rather than as two gradients
          sliding at random. */}
      <Parallax speed={0.08} className="absolute inset-0">
        <div aria-hidden className="kv-flood-glow" />
        <div aria-hidden className="kv-flood-beam" />
        <div aria-hidden className="kv-flood-lights" />
        {/* The stadium signage watermark (owner reference 2026-10-27) — the
            brand name itself, not a translated string, standing in as the
            ad board at the back of the stage. See .kv-flood-watermark. */}
        {/* Hidden below `wide`: on a phone the shirt stacks ABOVE the text
            (see the badge's own note below for the same pattern) rather
            than sitting beside it, so this would land behind the headline
            instead of the shirt and fight the text-side vignette's whole
            point. */}
        <div aria-hidden className="kv-flood-watermark hidden wide:flex">
          <span>
            KITVERSE
            <br />
            JERSEYS
          </span>
        </div>
      </Parallax>

      <Wrap className="relative">
        <div className="grid items-center gap-10 py-10 wide:grid-cols-[1.02fr_0.98fr] wide:gap-14 wide:py-16">
          <div className="order-2 wide:order-none">
            <span className="mono-eyebrow kv-flood-eyebrow kv-flood-eyebrow-rule">{t("eyebrow")}</span>
            {/* Three authored lines, each rising out of its own clip box —
                transform only, since this is the LCP text and it has to paint
                at full opacity on the first frame. Owner reference 2026-10-27
                ("نادريك. / ألوانك. / عصرك.") moved this from two lines to
                three; only the LAST line takes the gradient treatment now —
                the first two stay plain ink so the gradient still reads as
                an accent on the final word, not decoration on every line.
                .kv-flood-display, not .display-sm — see the hero's own note. */}
            <h1 className="kv-flood-display mt-4 mb-6">
              {(["titleA", "titleB", "titleC"] as const).map((key, index) => (
                <span key={key} className="line-mask">
                  <span
                    className={index === 2 ? "kv-flood-gradient-text" : undefined}
                    style={{ "--kv-delay": `${index * 90}ms` } as React.CSSProperties}
                  >
                    {t(key)}
                    {index < 2 ? " " : null}
                  </span>
                </span>
              ))}
            </h1>
            <p className="kv-flood-sub mb-8 max-w-[36ch]">{t("sub")}</p>
            <div className="mb-8 flex flex-wrap items-center gap-6">
              <Link href="/shop" className="btn btn-flood inline-flex items-center gap-2">
                {t("cta")}
                <span aria-hidden className="btn-flood-arrow">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
              <Link
                href="/shop/national-teams"
                className="underline-draw kv-flood-sub inline-flex items-center gap-1.5 text-[13px]"
              >
                {t("ctaSecondary")}
                <span aria-hidden className="btn-flood-arrow">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
            </div>

            {/* The reference's icon row (owner, 2026-10-27): Fan/Player's
                entry prices plus Retro as a standing invitation rather than a
                price, each with a small hand-drawn glyph — see .kv-flood-meta
                in globals.css. Replaces the old plain-text price line. */}
            <div className="kv-flood-meta text-[13px]">
              <span className="kv-flood-meta-item kv-flood-sub">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path
                    d="M8 4 4 7l2.2 2.5L8 8v12h8V8l1.8 1.5L20 7l-4-3-2 1.5h-4L8 4Z"
                    strokeLinejoin="round"
                  />
                </svg>
                {t("fanLabel")} {t("from")}{" "}
                <Price value={fanFrom} className="kv-flood-strong" />
              </span>
              <span className="kv-flood-meta-item kv-flood-sub">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 3 4 10l8 11 8-11-8-7Z" strokeLinejoin="round" />
                  <path d="M4 10h16M9 10 12 3l3 7M9 10l3 11 3-11" strokeLinejoin="round" />
                </svg>
                {t("playerLabel")} {t("from")}{" "}
                <Price value={playerFrom} className="kv-flood-strong" />
              </span>
              <span className="kv-flood-meta-item kv-flood-sub">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path
                    d="M4 8 7 6l3 3 2-4 2 4 3-3 3 2-1.5 8h-13L4 8Z"
                    strokeLinejoin="round"
                  />
                  <path d="M6 19h12" strokeLinecap="round" />
                </svg>
                {t("retroLabel")}
              </span>
            </div>
          </div>

          {/* Same fold-safety budget as Variant A: 82% of the measure on a
              phone, where the shirt stacks above the whole text block, and one
              viewport minus the header/padding/caption on a desktop. The badge
              is a sibling of the Parallax stage rather than inside it, so its
              own entrance/position stay simple while the stage keeps its
              tilt/parallax motion untouched. */}
          <div className="relative order-1 w-full max-w-[82%] justify-self-start wide:order-none wide:max-w-[calc(100svh-16rem)] wide:justify-self-end">
            <Parallax speed={0.18}>
              <FloodStage shirts={shirts} priority={priority} />
            </Parallax>

            {/* The reference's standalone "new season" badge (owner,
                2026-10-27) — static, unlike the per-shirt chip inside
                FloodStage, so it never has to change mid-crossfade. Hidden
                below `wide` purely for room: the stage is already near its
                82%-of-viewport budget on a phone and this would overlap the
                shirt rather than sit beside it. */}
            <Link
              href="/shop"
              className="kv-flood-badge absolute end-0 top-[58%] hidden w-[132px] -translate-y-1/2 translate-x-[38%] flex-col gap-1 px-4 py-4 wide:flex rtl:-translate-x-[38%]"
            >
              <span className="mono-eyebrow kv-flood-eyebrow text-[10px]">{t("badgeEyebrow")}</span>
              <span className="kv-flood-sub mt-1 text-[11px] uppercase tracking-wide">
                {t("badgeFrom")}
              </span>
              <span className="text-xl text-[var(--flood-ink)]">
                <Price value={fanFrom} />
              </span>
              <span className="kv-flood-badge-arrow mt-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </Link>
          </div>
        </div>
      </Wrap>

      {/* Painted last so its blend reaches every layer below it, including
          the content — see the rule's own note. */}
      <div aria-hidden className="kv-flood-grain" />
    </section>
  );
}
