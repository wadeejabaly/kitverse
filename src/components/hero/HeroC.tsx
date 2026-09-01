import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Parallax } from "@/components/motion/Parallax";
import { Wrap } from "@/components/shared/PageLede";
import { titleFor } from "@/lib/product";
import { pickShirts } from "./shirts";

/** Two shirts that do not read as the same shirt twice: blue-black stripes and
 *  a flat yellow. */
const C_SHIRTS = [
  "inter-milan-2025-26-home-shirt",
  "brazil-2026-27-home-shirt",
] as const;

/**
 * HERO C — the current typographic direction, at 70% volume.
 *
 * Same idea as the hero on the site today: three authored lines of display
 * type, an intro, two actions, and a pair of shirts at different parallax
 * speeds. Three things are dialled down.
 *
 * 1. The headline is `.display-quiet` — the home scale times 0.7 at both ends
 *    of its clamp (5.25rem → 3.7rem, 2.5rem → 1.75rem) and through the vw term
 *    between them.
 * 2. The section owns exactly one viewport and centres itself in it, so the
 *    CTAs are above the fold at 375px as well as on a desktop. The current
 *    hero runs past the fold on both.
 * 3. The tiles are a plain two-column grid aligned to a shared BASELINE
 *    (`items-end`), and that baseline is shared with the type column too. The
 *    current hero positions them absolutely inside an aspect box, which is
 *    where the awkward crops come from: nothing here is cropped, because a
 *    square tile with a contained image cannot crop.
 * 4. The parallax survives but is halved and more: 0.06 and 0.13 against the
 *    current 0.10 and 0.26. Desktop pointer only, as always.
 */
export async function HeroC({
  locale,
  priority = false,
}: {
  locale: string;
  priority?: boolean;
}) {
  const t = await getTranslations("heroPreview.c");
  const [primary, secondary] = pickShirts(C_SHIRTS, 2);

  return (
    <section className="flex min-h-[calc(100svh-76px)] flex-col justify-center">
      <Wrap>
        <div className="grid items-end gap-10 py-10 wide:grid-cols-[1.05fr_0.95fr] wide:gap-14 wide:py-16">
          <div>
            <span className="mono-eyebrow">{t("eyebrow")}</span>
            <h1 className="display-quiet mt-4 mb-6">
              {(["titleA", "titleB", "titleC"] as const).map((key, index) => (
                <span key={key} className="line-mask">
                  <span
                    style={{ "--kv-delay": `${index * 90}ms` } as React.CSSProperties}
                  >
                    {t(key)}
                    {index < 2 ? " " : null}
                  </span>
                </span>
              ))}
            </h1>
            <p className="mb-8 max-w-[42ch] text-ink-soft">{t("sub")}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/shop" className="btn">
                {t("cta")}
              </Link>
              <Link href="/shop/national-teams" className="btn btn-quiet">
                {t("ctaSecondary")}
              </Link>
            </div>
          </div>

          {/* Two squares of unequal width, bottom edges on one line. The
              asymmetry is in the column ratio, not in a stack of absolute
              offsets — which is what keeps the composition clean at every
              width, including 375px, where both tiles survive. */}
          {primary ? (
            <div className="grid grid-cols-[1.35fr_1fr] items-end gap-4">
              <Parallax speed={0.06}>
                <Link
                  href={`/product/${primary.handle}`}
                  className="group grid aspect-square place-items-center overflow-hidden bg-tile"
                >
                  <Image
                    src={primary.image}
                    alt={titleFor(primary, locale)}
                    width={1000}
                    height={1000}
                    priority={priority}
                    sizes="(max-width: 900px) 55vw, 320px"
                    className="h-auto w-[86%] transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                  />
                </Link>
              </Parallax>

              {secondary ? (
                <Parallax speed={0.13}>
                  <Link
                    href={`/product/${secondary.handle}`}
                    className="group grid aspect-square place-items-center overflow-hidden bg-tile"
                  >
                    <Image
                      src={secondary.image}
                      alt={titleFor(secondary, locale)}
                      width={800}
                      height={800}
                      sizes="(max-width: 900px) 41vw, 240px"
                      className="h-auto w-[86%] transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                    />
                  </Link>
                </Parallax>
              ) : null}
            </div>
          ) : null}
        </div>
      </Wrap>
    </section>
  );
}
