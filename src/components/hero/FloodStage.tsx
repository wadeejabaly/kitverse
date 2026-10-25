"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { heavyMotionAllowed, motionAllowed } from "@/components/motion/env";
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
 *
 * Owner request 2026-10-23 ("the best hero in the world") added two more
 * cosmetic-only layers — a blurred crest watermark behind the glow, and a
 * cursor-driven tilt on the whole stage — plus the breathing glow and the
 * double shadow, both authored entirely in globals.css. None of the three
 * touch the safety story above: the tilt is set via a plain DOM write (not
 * React state, so it never forces a render) and only runs behind
 * heavyMotionAllowed(), the same desktop-pointer-and-motion-allowed gate
 * <Parallax/> uses — everywhere else --kv-rx/--kv-ry are simply never set
 * and .kv-flood-tilt's calc()s resolve to their zero fallback.
 */
export function FloodStage({
  shirts,
  priority = false,
}: {
  shirts: FloodShirt[];
  priority?: boolean;
}) {
  const [active, setActive] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shirts.length < 2 || !motionAllowed()) return;
    const id = window.setInterval(
      () => setActive((current) => (current + 1) % shirts.length),
      CYCLE_MS,
    );
    return () => window.clearInterval(id);
  }, [shirts.length]);

  // Cursor tilt. Plain DOM writes on every pointermove, rAF-throttled, never
  // React state — a re-render per mousemove frame is not free, and the only
  // thing that has to change is two CSS custom properties .kv-flood-tilt
  // already knows how to read.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !heavyMotionAllowed()) return;

    let frame = 0;
    const onMove = (event: PointerEvent) => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const rect = stage.getBoundingClientRect();
        const rx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const ry = ((event.clientY - rect.top) / rect.height) * 2 - 1;
        stage.style.setProperty("--kv-rx", rx.toFixed(3));
        stage.style.setProperty("--kv-ry", ry.toFixed(3));
      });
    };
    const onLeave = () => {
      stage.style.setProperty("--kv-rx", "0");
      stage.style.setProperty("--kv-ry", "0");
    };

    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  if (shirts.length === 0) return null;

  return (
    <div
      ref={stageRef}
      className="kv-flood-tilt relative grid aspect-square place-items-center overflow-hidden"
    >
      {/* Brand-as-atmosphere, not a logo anyone is meant to read — see the
          rule's own note. Behind the glow and every shirt layer, so it never
          competes with the thing actually being sold. */}
      <div aria-hidden className="kv-flood-crest-mark">
        <Image src="/brand/badge-glow.png" alt="" width={480} height={480} />
      </div>
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
            className="kv-crossfade group relative col-start-1 row-start-1 grid aspect-square w-full place-items-center"
          >
            {/* Fixed 2026-10-25 — two parts, both needed:
                1. This element used to be sized `h-full`, which chases the
                   stage's own height. But the three crossfading layers share
                   one implicit grid row, and that row auto-sizes to its
                   TALLEST child's natural content height — so a portrait-
                   leaning supplier photo (taller, at a fixed 84% width, than
                   the stage is tall) stretched the row past the stage's own
                   aspect-square box, and `h-full` just chased that stretched
                   row rather than the visible square. `aspect-square` here
                   instead gives this element a height derived from its OWN
                   (definite) width, independent of its siblings or its
                   photo's content — always exactly the stage's square,
                   whatever any shirt's photo does.
                2. That in turn is what lets the image's `max-h-[84%]` below
                   actually apply: a percentage max-height only resolves
                   against a DEFINITE parent height (CSS's old height-
                   percentage rule) — against the previous indefinite,
                   content-chasing row it silently computed to `none` and
                   did nothing, which is why bounding only the image never
                   fully fixed this on its own.
                Together: every photo, whatever its native proportions, now
                renders inside the square the stage actually shows, so the
                chip below — bottom-2 off THIS element — never rides past
                the stage's own overflow-hidden edge and gets clipped, which
                is the "cut off" name/price chip the owner saw. */}
            <Image
              src={shirt.image}
              alt={shirt.title}
              width={1200}
              height={1200}
              priority={priority && index === 0}
              sizes="(max-width: 900px) 86vw, 560px"
              className="kv-flood-shirt-shadow h-auto max-h-[84%] w-auto max-w-[84%] object-contain transition-transform duration-300 ease-out group-hover:scale-[1.03]"
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
