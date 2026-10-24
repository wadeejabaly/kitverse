import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Product } from "@/data/types";
import { Wrap } from "@/components/shared/PageLede";
import { cn } from "@/lib/utils";
import { spreadShirts } from "./shirts";

/**
 * HERO B — full-bleed showcase. THE HOME PAGE HERO.
 *
 * Chosen out of the three variants on /hero-preview and promoted unchanged.
 * Its copy lives in the `home.hero` namespace rather than `heroPreview.b`,
 * because it is the storefront's opening line now and not a pitch — the
 * preview page renders this same component, so both places read the one
 * source.
 *
 * The argument is breadth: two offset rows of product tiles drifting past each
 * other behind a navy plaque carrying the headline and the one action. It is
 * meant to read as a wall of shirts with a sign on it — ambient, not busy.
 *
 * Three decisions keep it on the quiet side of that line:
 *
 * - The rows drift in OPPOSITE directions at different speeds (~2 minutes for
 *   a full pass) and carry different tile sizes, so nothing in the composition
 *   pulses or falls into step.
 * - The wall is `aria-hidden` and `pointer-events-none`. It is texture: every
 *   shirt in it is reachable from the catalogue the CTA opens, and a screen
 *   reader is not made to walk twenty unlabelled links to reach a button.
 * - The wall is masked to nothing at the top and bottom of the section, so it
 *   fades into the page ground instead of ending on a hard edge.
 *
 * THE PLAQUE IS A MATERIAL. It began as a flat fill of `--band` and read as
 * exactly that — a navy rectangle dropped on the wall. It is now a frosted
 * navy glass echoing the header: a heavy directional tint over a blurred view
 * of the shirts drifting behind it, with a fractal grain and a hairline plate
 * frame set in from the edge. The layers live in `globals.css` under THE BAND;
 * the only thing this file owns is their ORDER, which is load-bearing — see
 * the note on `.band-glass` below.
 *
 * OVERLAY CONTRAST. The tiles are pure white and the shirts on them are any
 * colour at all, so there is no scrim value that is safe against the worst-case
 * pixel — and once the plaque stopped being opaque, that pixel started to
 * matter. It is answered by density rather than by opacity: the tint runs
 * 88%→80% (light) and 92%→85% (dark), which is what a white tile directly
 * behind the type has to get through. Measured on the composited frame, not
 * computed from the token: 8.39:1 headline / 5.48:1 band-soft in light,
 * 8.81:1 / 5.67:1 in dark. Below the `wide` breakpoint, and anywhere the blur
 * is unavailable or unwanted, the same gradient paints opaque and the numbers
 * go back up to 12.92:1 / 7.82:1.
 *
 * The CTA inverts to `.btn-band` because in light mode `--accent` and `--band`
 * are the same navy and a default button would vanish into the panel. It is an
 * opaque fill, so the frost never reaches it: 15.2:1 / 14.1:1 either way.
 *
 * The plaque also gets one entrance — a 620ms rise, transform only, no loop.
 * The headline is the LCP element, so nothing here fades in.
 */
export async function HeroB({ priority = false }: { priority?: boolean }) {
  const t = await getTranslations("home.hero");

  // Even strides through the approved set — see spreadShirts(). The two rows
  // are offset from each other so no shirt is on screen twice.
  const rowOne = spreadShirts(8);
  const rowTwo = spreadShirts(9, 11);

  if (rowOne.length === 0) return null;

  return (
    <section className="relative isolate flex min-h-[calc(100svh-76px)] flex-col justify-center overflow-hidden">
      <div
        aria-hidden
        // The rows are pushed APART to the top and bottom of the section
        // rather than stacked in the middle. Centred, the two of them make a
        // 500px block that the plaque then covers almost entirely — and on a
        // 375px phone, where the plaque is the full measure, the wall
        // disappears behind it and the section stops making its own argument.
        // Split to the edges, the wall reads as a wall at every width: the
        // plaque overlaps its inner edges on a desktop and sits in the clear
        // between the rows on a phone.
        className="kv-wall pointer-events-none absolute inset-0 flex flex-col justify-between py-[clamp(2.5rem,5vw,3.5rem)]"
      >
        <MarqueeRow
          products={rowOne}
          duration="128s"
          size="clamp(150px,24vw,280px)"
          priority={priority}
        />
        <MarqueeRow
          products={rowTwo}
          duration="164s"
          size="clamp(126px,20vw,232px)"
          reverse
        />
      </div>

      <Wrap className="relative">
        <div className="band w-full max-w-[min(34rem,100%)] px-[clamp(1.5rem,3vw,2.5rem)] py-[clamp(1.75rem,3.6vw,3rem)]">
          {/* The frosted layer, and the reason the content below it is wrapped
              in its own positioned box: two positioned children in tree order
              paint glass-then-content without the plaque needing a stacking
              context of its own — and a stacking context here would cut the
              blur off from the wall it is supposed to be looking through. */}
          <span className="band-glass" aria-hidden />
          <div className="relative">
            {/* Gold is not used inside the band — it measures 2.8:1 on the navy.
                The eyebrow takes the band's own soft ink instead. */}
            <span className="mono-eyebrow band-soft">{t("eyebrow")}</span>
            <h1 className="display-sm mt-4 mb-5">
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
            <p className="mb-8 max-w-[36ch] text-sm band-soft">{t("sub")}</p>
            <Link href="/shop" className="btn btn-band">
              {t("cta")}
            </Link>
          </div>
        </div>
      </Wrap>
    </section>
  );
}

/**
 * One drifting row.
 *
 * The strip holds the products TWICE and translates by exactly half its own
 * width, so the frame it ends on is pixel-identical to the frame it starts on
 * and the loop has no seam. That identity is why the spacing is a
 * margin-inline-end on each tile rather than a flex `gap`: with a gap, half the
 * strip's width is (n·tile + (n−0.5)·gap), which is half a gap short of a whole
 * number of tiles, and the loop would jog sideways once a cycle.
 *
 * The second copy costs no bandwidth — same `src`, so the browser makes one
 * request per shirt and paints it twice.
 */
function MarqueeRow({
  products,
  duration,
  size,
  reverse = false,
  priority = false,
}: {
  products: Product[];
  /** Time for one full pass — a different value per row, so they never sync. */
  duration: string;
  /** Tile edge, as a CSS length. */
  size: string;
  reverse?: boolean;
  priority?: boolean;
}) {
  const tiles = [...products, ...products];

  return (
    <div className="overflow-hidden">
      <div
        className={cn("kv-marquee", reverse && "kv-marquee-reverse")}
        style={{ "--kv-drift": duration } as React.CSSProperties}
      >
        {tiles.map((product, index) => (
          <div
            key={`${product.handle}-${index}`}
            style={{ width: size }}
            className="grid aspect-square shrink-0 place-items-center bg-tile me-[clamp(0.75rem,1.6vw,1.25rem)]"
          >
            <Image
              src={product.image}
              alt=""
              width={560}
              height={560}
              priority={priority && index < 4}
              sizes="280px"
              className="h-auto w-[86%]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
