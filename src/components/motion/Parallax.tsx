"use client";

import { useEffect, useRef } from "react";
import { heavyMotionAllowed } from "./env";

/**
 * Scroll-scrubbed parallax for one element.
 *
 * Translate only, and small: `speed` is a fraction of the element's own
 * height, and the hero uses 0.10–0.26. That is the difference between depth
 * you feel and depth you notice, and the second one always reads as a
 * gimmick.
 *
 * `scrub: true` — never a number. A numeric scrub adds GSAP's own smoothing
 * on top of Lenis's, and the two easings fight each other into a float.
 *
 * Desktop pointer + motion allowed only; everywhere else this renders a plain
 * wrapper and never loads GSAP.
 */
export function Parallax({
  children,
  className,
  speed = 0.16,
}: {
  children: React.ReactNode;
  className?: string;
  /** Fraction of the element's height to travel across the full scroll pass. */
  speed?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !heavyMotionAllowed()) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled || !ref.current) return;
      gsap.registerPlugin(ScrollTrigger);

      const tween = gsap.fromTo(
        ref.current,
        { yPercent: speed * 50 },
        {
          yPercent: -speed * 50,
          ease: "none",
          scrollTrigger: {
            trigger: ref.current,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        },
      );

      cleanup = () => {
        tween.scrollTrigger?.kill();
        tween.kill();
        gsap.set(ref.current, { clearProps: "transform" });
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [speed]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
