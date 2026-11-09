import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getProduct } from "@/data/catalog";
import { priceFor } from "@/data/pricing";
import { Parallax } from "@/components/motion/Parallax";
import { Wrap } from "@/components/shared/PageLede";
import { Price } from "@/components/shared/Money";
import { titleFor } from "@/lib/product";
import { SHOWCASE_JERSEYS } from "@/data/showcase";
import { JerseyShowcase, type ShowcaseItem } from "./JerseyShowcase";

/**
 * The shirt on the pedestal is the interactive showcase (owner spec
 * 2026-11-09): JerseyShowcase draws public/home/showcase/plate.webp — the
 * former Real Madrid composite (public/home/hero-real-madrid.webp, the shop's
 * own catalogue photo placed on the marble pedestal with Higgsfield) with the
 * shirt taken out — and lays the selected shirt's frames on it in the exact
 * box the original shirt filled, so the scene, the pedestal and the shirt's
 * size and position are unchanged. Which shirts, in what order:
 * src/data/showcase.ts (Real Madrid first, for every locale).
 */

/**
 * HERO D — THE STADIUM. THE HOME PAGE HERO.
 *
 * Rebuilt 2026-11-09 against the owner's two reference screenshots
 * (EN + AR): a full-bleed night-stadium photograph instead of the old CSS
 * gradient "floodlight" surface, the headline on the reading side, and the
 * shirt standing on its pedestal on the other side, with the "new season"
 * price card beside it.
 *
 * Layers, back to front:
 *   1. public/home/stadium.webp — generated with Higgsfield as a pure plate
 *      (no text, no logos, no shirts), floodlights in its right half. In RTL
 *      it is mirrored with a CSS flip so the lights stay behind the shirt;
 *      that is safe precisely because the plate carries no lettering.
 *   2. .kv-stadium-shade — darkens the reading side and fades the bottom
 *      edge into --flood-ground, so the category cards below sit on the same
 *      night rather than on a hard seam.
 *   3. The two-column content. The composite is feathered into the plate
 *      with a radial mask (.kv-stadium-shirt), so it reads as one scene.
 *
 * Copy comes from `home.hero` (unchanged keys). Prices come from the price
 * list via priceFor(), never hardcoded.
 */
export async function HeroD({
  locale,
  priority = false,
}: {
  locale: string;
  priority?: boolean;
}) {
  const t = await getTranslations("home.hero");

  // The interactive showcase (src/data/showcase.ts): each shirt's name and
  // link come from the catalogue; a shirt that is off the site links to /shop.
  // Demo items (the unbranded 360° test shirt) never reach production.
  const showcase: ShowcaseItem[] = SHOWCASE_JERSEYS.filter((jersey) => !jersey.demo || process.env.VERCEL_ENV !== "production").map((jersey) => {
    const product = jersey.handle ? getProduct(jersey.handle) : undefined;
    return {
      id: jersey.id,
      views: jersey.views,
      title: product ? titleFor(product, locale) : jersey.name,
      href: product?.visible ? `/product/${product.handle}` : "/shop",
    };
  });

  // "From" prices exactly as the cards state them: smallest size, non-retro.
  const fanFrom = priceFor("2026/27", "S", "fan");
  const playerFrom = priceFor("2026/27", "S", "player");

  return (
    <section className="kv-flood kv-stadium relative overflow-hidden">
      {/* 1. The stadium plate. Decorative (alt=""), LCP-adjacent, so it is
          priority-loaded with the shirt. */}
      <Parallax speed={0.08} className="absolute inset-0">
        <Image
          src="/home/stadium.webp"
          alt=""
          fill
          priority={priority}
          sizes="100vw"
          className="kv-stadium-plate object-cover"
        />
      </Parallax>
      <div aria-hidden className="kv-stadium-shade" />
      {/* The stadium signage — the brand name on an ad board behind the
          shirt, as in the reference. Not translated, as a hoarding wouldn't
          be. Desktop only: on a phone it would sit behind the headline. */}
      <div aria-hidden className="kv-flood-watermark kv-stadium-watermark hidden wide:flex">
        <span>
          KITVERSE
          <br />
          JERSEYS
        </span>
      </div>

      <Wrap className="relative">
        <div className="grid items-center gap-6 pt-2 pb-10 wide:min-h-[min(calc(100svh-105px),760px)] wide:grid-cols-[1fr_1fr] wide:gap-10 wide:py-12">
          <div className="order-2 wide:order-none">
            <span className="mono-eyebrow kv-flood-eyebrow kv-flood-eyebrow-rule">
              {t("eyebrow")}
            </span>
            {/* Three authored lines: white, white, electric blue — the
                reference's colour split. Each rises out of its own clip box,
                transform only, since this is the LCP text. */}
            <h1 className="kv-stadium-display mt-4 mb-5">
              {(["titleA", "titleB", "titleC"] as const).map((key, index) => (
                <span key={key} className="line-mask">
                  <span
                    className={index === 2 ? "kv-stadium-accent" : undefined}
                    style={{ "--kv-delay": `${index * 90}ms` } as React.CSSProperties}
                  >
                    {t(key)}
                    {index < 2 ? " " : null}
                  </span>
                </span>
              ))}
            </h1>
            <p className="kv-stadium-sub mb-8 max-w-[40ch]">{t("sub")}</p>

            <div className="mb-8 flex flex-wrap items-center gap-x-8 gap-y-5">
              <Link href="/shop" className="kv-stadium-cta">
                {t("cta")}
                <span aria-hidden className="btn-flood-arrow">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
              <Link href="/shop/national-teams" className="kv-stadium-link">
                {t("ctaSecondary")}
                <span aria-hidden className="btn-flood-arrow">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
            </div>

            {/* The price row: hairline above, three gold glyphs, each with a
                small label over a large blue price (Retro is an invitation,
                not a price). Hand-drawn inline SVGs, nothing to license. */}
            <div className="kv-stadium-meta">
              <div className="kv-stadium-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M8 4 4 7l2.2 2.5L8 8v12h8V8l1.8 1.5L20 7l-4-3-2 1.5h-4L8 4Z" strokeLinejoin="round" />
                </svg>
                <span className="flex flex-col">
                  <span className="kv-stadium-meta-label">
                    {t("fanLabel")} {t("from")}
                  </span>
                  <Price value={fanFrom} className="kv-stadium-meta-price" />
                </span>
              </div>
              <div className="kv-stadium-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M12 21 3 9.5 6.5 4h11L21 9.5 12 21Z" strokeLinejoin="round" />
                  <path d="M3 9.5h18M8.5 4 7 9.5l5 11.5 5-11.5L15.5 4M7 9.5 12 4l5 5.5" strokeLinejoin="round" />
                </svg>
                <span className="flex flex-col">
                  <span className="kv-stadium-meta-label">
                    {t("playerLabel")} {t("from")}
                  </span>
                  <Price value={playerFrom} className="kv-stadium-meta-price" />
                </span>
              </div>
              <Link href="/shop/retro" className="kv-stadium-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 10H5L3 8Z" strokeLinejoin="round" />
                </svg>
                <span className="kv-stadium-meta-strong">{t("retroLabel")}</span>
              </Link>
            </div>
          </div>

          {/* The shirt on its pedestal, plus the new-season card. On a phone
              the shirt stacks ABOVE the text (order-1) at a size that keeps
              the headline close to the fold. */}
          <div className="relative order-1 mx-auto w-full max-w-[min(64vw,300px)] wide:order-none wide:max-w-[560px]">
            <Parallax speed={0.14}>
              <JerseyShowcase
                items={showcase}
                priority={priority}
                labels={{ prev: t("showcasePrev"), next: t("showcaseNext"), rotate: t("showcaseRotate"), open: t("showcaseOpen") }}
              />
            </Parallax>

            <Link href="/shop" className="kv-flood-badge kv-stadium-badge">
              <span className="mono-eyebrow kv-flood-eyebrow text-[11px]">{t("badgeEyebrow")}</span>
              <span aria-hidden className="kv-stadium-badge-rule" />
              <span className="kv-flood-sub mt-3 text-[12px] tracking-wide uppercase">
                {t("badgeFrom")}
              </span>
              <span className="flex items-center justify-between gap-4">
                <Price value={fanFrom} className="kv-stadium-badge-price" />
                <span className="kv-flood-badge-arrow">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </span>
            </Link>
          </div>
        </div>
      </Wrap>

      <div aria-hidden className="kv-flood-grain" />
    </section>
  );
}
