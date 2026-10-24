"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "@/i18n/navigation";
import { heavyMotionAllowed } from "./env";

type LenisLike = {
  raf: (time: number) => void;
  scrollTo: (
    target: number | string | HTMLElement,
    options?: Record<string, unknown>,
  ) => void;
  on: (event: string, handler: () => void) => void;
  destroy: () => void;
};

/**
 * Site-wide motion runtime. Renders nothing.
 *
 * Two jobs:
 *
 * 1. Reset the scroll position on navigation. The App Router keeps the scroll
 *    offset across some client transitions, and once a smooth-scroll library
 *    owns the scroll position the browser's own restoration is no longer
 *    authoritative. This runs for everyone, with or without Lenis.
 *
 * 2. Start smooth scrolling — desktop pointer devices only, motion allowed
 *    only. See heavyMotionAllowed(): phones and reduced-motion readers never
 *    even fetch these chunks, which is what keeps the mobile bundle honest.
 *
 * ScrollTrigger is driven off Lenis's scroll event rather than the native one,
 * which is what keeps scrubbed parallax locked to the smoothed position
 * instead of lagging a frame behind it.
 */
export function MotionProvider() {
  const pathname = usePathname();
  const lenisRef = useRef<LenisLike | null>(null);

  // Navigation always lands at the top of the new page.
  useEffect(() => {
    const lenis = lenisRef.current;
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (!heavyMotionAllowed()) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      const [{ default: Lenis }, { gsap }, { ScrollTrigger }] = await Promise.all([
        import("lenis"),
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;

      gsap.registerPlugin(ScrollTrigger);

      const lenis = new Lenis({
        duration: 1.05,
        // Ease out, no overshoot — the house easing, expressed as a decay.
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
        smoothWheel: true,
      }) as unknown as LenisLike;
      lenisRef.current = lenis;

      lenis.on("scroll", ScrollTrigger.update);

      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      // Lenis is already frame-locked; GSAP's lag smoothing on top of it
      // double-corrects and shows up as a stutter on slow frames.
      gsap.ticker.lagSmoothing(0);

      // In-page anchors must go through Lenis, or the native jump fights the
      // smoothed position and the page ends up somewhere neither expected.
      const onClick = (event: MouseEvent) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const anchor = (event.target as HTMLElement | null)?.closest?.("a");
        const href = anchor?.getAttribute("href");
        if (!href || !href.startsWith("#") || href.length < 2) return;
        const target = document.getElementById(href.slice(1));
        if (!target) return;
        event.preventDefault();
        lenis.scrollTo(target, { offset: -100 });
      };
      document.addEventListener("click", onClick);

      cleanup = () => {
        document.removeEventListener("click", onClick);
        gsap.ticker.remove(tick);
        lenis.destroy();
        lenisRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}
