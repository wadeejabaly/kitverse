"use client";

import { useEffect } from "react";
import { usePathname } from "@/i18n/navigation";

/**
 * Site-wide motion runtime. Renders nothing.
 *
 * Resets the scroll position on navigation - the App Router keeps the scroll offset across some
 * client transitions, and every page should land at the top.
 *
 * Smooth scrolling (Lenis) was removed 2026-11-05 (owner report: "a little bit of lag scrolling
 * through the website"): it replayed every wheel/trackpad movement over ~1 s, so the page kept
 * gliding ~0.9 s after the hand stopped, and any slow frame showed as a hitch. Scrolling is the
 * browser's own again; the hero's scrubbed parallax (<Parallax/>) runs on native scroll via
 * ScrollTrigger, no smoothing layer needed.
 */
export function MotionProvider() {
  const pathname = usePathname();

  // Navigation always lands at the top of the new page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
