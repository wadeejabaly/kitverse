"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { motionAllowed } from "@/components/motion/env";
import { Price } from "@/components/shared/Money";

export interface HeroShirt {
  handle: string;
  image: string;
  title: string;
  price: number;
}

/** Long enough to read as a change of subject rather than a carousel. */
const CYCLE_MS = 7000;

/**
 * Variant A's stage: one large shirt on a white tile, with its name and price
 * beneath it, slowly exchanged for the next shirt.
 *
 * The layers all exist in the server-rendered markup, stacked in a single grid
 * cell, with the first shirt at full opacity and the rest at zero. That is the
 * whole safety story: no JavaScript, no motion permission, a failed hydration —
 * every one of those paths lands on "the first shirt is on screen", which is
 * also the LCP element. The timer only ever changes which layer is opaque.
 *
 * Opacity is the only property animated (see `.kv-crossfade`), and the timer
 * does not start at all for a reader who has asked for reduced motion, so the
 * hero is simply static for them rather than static-but-still-ticking.
 */
export function ShirtStage({
  shirts,
  priority = false,
}: {
  shirts: HeroShirt[];
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
    <div>
      <div className="grid aspect-square place-items-center overflow-hidden bg-tile">
        {shirts.map((shirt, index) => {
          const shown = index === active;
          return (
            // The inactive layers are removed from the accessibility tree AND
            // from the tab order — an aria-hidden link that can still be
            // focused is a keyboard trap with no announcement.
            <Link
              key={shirt.handle}
              href={`/product/${shirt.handle}`}
              aria-hidden={shown ? undefined : true}
              tabIndex={shown ? undefined : -1}
              style={{
                opacity: shown ? 1 : 0,
                pointerEvents: shown ? undefined : "none",
              }}
              className="kv-crossfade group col-start-1 row-start-1 grid h-full w-full place-items-center"
            >
              <Image
                src={shirt.image}
                alt={shirt.title}
                width={1200}
                height={1200}
                priority={priority && index === 0}
                sizes="(max-width: 900px) 86vw, 560px"
                className="h-auto w-[84%] transition-transform duration-300 ease-out group-hover:scale-[1.03]"
              />
            </Link>
          );
        })}
      </div>

      {/* The caption crossfades with the shirt it names, in the same stacked
          cell, so the row never changes height and nothing below it moves. */}
      <div className="mt-4 grid">
        {shirts.map((shirt, index) => (
          <div
            key={shirt.handle}
            aria-hidden={index === active ? undefined : true}
            style={{ opacity: index === active ? 1 : 0 }}
            className="kv-crossfade col-start-1 row-start-1 flex items-baseline justify-between gap-3"
          >
            <span className="text-sm">{shirt.title}</span>
            <span className="text-sm text-accent">
              <Price value={shirt.price} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
