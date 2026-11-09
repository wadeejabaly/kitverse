import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Reveal } from "@/components/motion/Reveal";
import { CATEGORY_IMAGES } from "./category-images";

/**
 * THE WAYS IN, rebuilt as the reference's four-up photo grid (owner,
 * 2026-10-27: "i want like this" against a mockup whose second half, below
 * the hero, is Clubs / National Teams / Retro Classics / Accessories as
 * photo cards with a white heading and a circular arrow).
 *
 * Revised same day, owner: "its not looking the same as the picture i
 * provided" — the first pass kept this as a conventional page section
 * (eyebrow label, Wrap-constrained width, a gap above it, tall 3:4 cards).
 * The reference has none of that: the grid is FULL-BLEED and sits flush
 * against the hero's bottom edge with no gap and no label, the cards are
 * short and wide, not tall, and the heading is bold caps, not the site's
 * usual sentence case. All of that is deliberate here now — this section
 * reads as the floor of the hero rather than a new page section, which is
 * why it is rendered as HeroD's own sibling in page.tsx with NO <Wrap>
 * around it, unlike every other section on the page.
 *
 * Replaces the old text-link "THE WAYS IN" row rather than joining it — both
 * do the same job (the shop's four doors), and a page that offers two
 * different-looking versions of the same four links is confusing, not
 * generous.
 *
 * The four doors are not identical to the old `ways` array: Retro and
 * National keep their collections (/shop/retro, /shop/national-teams), but
 * "This season" + "Last season" collapse into one "Clubs" door (there is no
 * single club-shirts collection to link straight to, and the reference does
 * not want two separate club tiles) pointing at /shop, and a fourth door,
 * Accessories, is new — the site already has that section at /accessories,
 * it just never had a home-page entry point of its own before this.
 *
 * Unlike the old row, this is NOT conditional on catalog counts: all four
 * destinations are standing sections of the shop (Accessories and Retro both
 * render their own empty state when they have nothing yet — see retroTile's
 * own note in page.tsx for why Retro in particular is never hidden), so
 * hiding a tile here would be hiding a real, working page.
 *
 * Rounded corners here ARE an explicit, scoped exception to --radius-*
 * being flattened to 0px sitewide ("Radius 0 is a design decision" —
 * globals.css): the owner's follow-up spec (2026-10-27) asked for rounded
 * cards with a thin border specifically for this grid, by name, and a
 * hand-written px value in .kv-cat-card is how that happens without
 * touching the --radius-* tokens every sharp-cornered element on the site
 * still reads from.
 */
const CARDS = ["clubs", "national", "retro", "accessories"] as const;

const CARD_HREF: Record<(typeof CARDS)[number], string> = {
  clubs: "/shop",
  national: "/shop/national-teams",
  retro: "/shop/retro",
  accessories: "/accessories",
};

export async function CategoryGrid() {
  const t = await getTranslations("home.categories");

  return (
    <Reveal
      as="section"
      stagger={80}
      className="kv-cat-strip grid grid-cols-2 gap-2.5 px-2.5 pb-2.5 wide:grid-cols-4 wide:gap-3 wide:px-3 wide:pb-3"
    >
      {CARDS.map((card) => {
        const image = CATEGORY_IMAGES[card];
        return (
          <Link
            key={card}
            href={CARD_HREF[card]}
            className="kv-cat-card group relative block aspect-[4/3] overflow-hidden wide:aspect-[19/10]"
          >
            {/* next/image (rebuilt 2026-11-09): the photos are real assets
                now, not stand-ins, so they get responsive sizes like every
                other product photo on the site. Decorative — the title is
                the link's accessible name. */}
            <span
              aria-hidden
              className="kv-cat-card-media transition-transform duration-500 ease-out group-hover:scale-[1.05]"
            >
              <Image
                src={image.src}
                alt=""
                fill
                sizes="(max-width: 900px) 50vw, 25vw"
                className="object-cover"
                style={{ objectPosition: image.focus }}
              />
            </span>
            <span aria-hidden className="kv-cat-card-shade" />
            <span className="kv-cat-card-content">
              <span className="kv-cat-card-title">{t(`${card}.title`)}</span>
              <span className="kv-cat-card-sub">{t(`${card}.body`)}</span>
            </span>
            <span aria-hidden className="kv-cat-card-arrow">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </Link>
        );
      })}
    </Reveal>
  );
}
