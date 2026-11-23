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
