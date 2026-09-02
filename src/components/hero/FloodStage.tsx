"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { motionAllowed } from "@/components/motion/env";
import { Price } from "@/components/shared/Money";

export interface FloodShirt {
  handle: string;
  image: string;
  title: string;
  price: number;
}

/** Long enough to read as a change of subject rather than a carousel. */
const CYCLE_MS = 7000;

/**
 * <HeroD/>'s stage: one shirt lit by its own radial glow, with a small corner
 * chip naming it and its price, slowly exchanged for the next shirt.
 *
 * Structurally this is the same safety story as Variant A's <ShirtStage/>:
 * every layer is server-rendered, the first shirt sits at full opacity and the
 * rest at zero, and the timer only ever changes WHICH layer is opaque — so a
 * failed hydration, a reader with no JS and a reader who has asked for reduced
 * motion all land on "the first shirt is on screen", which is also the LCP
 * image. Nothing here is authored offscreen behind a JS reveal.
 *
 * What changes for the Floodlight surface is cosmetic: a transparent stage
 * instead of a white tile, a glow behind the shirt instead of a plain
 * background, and the caption folded into an overlaid chip instead of a row
 * underneath.
 */
export function FloodStage({
  shirts,
  priority = false,
}: {
  shirts: FloodShirt[];
  priority?: boolean;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (shirts.length < 2 || !motionAllowed()) return;
    const id = window.setInterval(
      () => setActive((current) => (current + 1) % shirts.length),
      CYCLE_MS,
    );
    return () => window.clearInterval(id);
  }, [shirts.length]);

  if (shirts.length === 0) return null;

  return (
    <div className="relative grid aspect-square place-items-center overflow-hidden">
      <div aria-hidden className="kv-flood-shirt-glow" />
      {shirts.map((shirt, index) => {
        const shown = index === active;
        return (
          // The inactive layers leave the accessibility tree AND the tab order:
          // an aria-hidden link that can still be focused is a keyboard trap
          // with nothing announced when you reach it.
          <Link
            key={shirt.handle}
            href={`/product/${shirt.handle}`}
            aria-hidden={shown ? undefined : true}
            tabIndex={shown ? undefined : -1}
            style={{
              opacity: shown ? 1 : 0,
              pointerEvents: shown ? undefined : "none",
            }}
            className="kv-crossfade group relative col-start-1 row-start-1 grid h-full w-full place-items-center"
          >
            <Image
              src={shirt.image}
              alt={shirt.title}
              width={1200}
              height={1200}
              priority={priority && index === 0}
              sizes="(max-width: 900px) 86vw, 560px"
              className="h-auto w-[84%] drop-shadow-[0_30px_50px_rgba(0,0,0,0.55)] transition-transform duration-300 ease-out group-hover:scale-[1.03]"
            />
            {/* The chip belongs to the SAME crossfading layer as its shirt (not
                a separate stacked row like Variant A's caption), so it can only
                ever be on screen with the shirt it names. */}
            <span className="kv-flood-chip absolute end-2 bottom-2 px-4 py-2.5 text-[13px]">
              {shirt.title}{" "}
              <strong>
                <Price value={shirt.price} />
              </strong>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
