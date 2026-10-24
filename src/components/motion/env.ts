/**
 * The two gates every piece of motion on this site asks before it runs.
 *
 * Both are deliberately read at call time rather than cached: a reader can
 * turn "reduce motion" on in the OS mid-session, and a hybrid laptop can gain
 * a mouse. Neither is hot enough for the matchMedia call to matter.
 */

/** Reduced motion is a hard stop, not a dial. */
export function motionAllowed() {
  if (typeof window === "undefined") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Desktop-with-a-real-pointer. This is the gate on the heavy motion stack:
 * smooth scroll and scroll-scrubbed parallax load ONLY here.
 *
 * It is a performance decision before it is a taste one. GSAP + ScrollTrigger
 * + Lenis is well over 100KB of JavaScript, the Lighthouse budget on this
 * build is the MOBILE score, and a phone gets nothing out of hijacked
 * scrolling — native momentum scrolling is already better than anything we
 * would ship. So the dynamic imports sit behind this check and a phone never
 * requests those chunks at all.
 */
export function heavyMotionAllowed() {
  if (typeof window === "undefined") return false;
  return (
    motionAllowed() &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    window.innerWidth >= 900
  );
}
