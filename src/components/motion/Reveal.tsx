"use client";

import { useEffect, useRef } from "react";
import { motionAllowed } from "./env";

/**
 * A scroll entrance for one meaningful block — or, with `stagger`, for a row
 * of them.
 *
 * The safety property this component is built around: the markup it renders
 * carries NO reveal styling. The server sends plain, visible content; the
 * start state is added here, by JavaScript, only once we have confirmed that
 * motion is allowed. Every failure mode therefore lands on "the content is
 * already visible" — reduced motion, no JS, a bundle that never arrives, an
 * observer that never fires, a crawler.
 *
 * It also refuses to animate anything that is already on screen at mount.
 * Hiding something the reader can currently see, in order to slide it back
 * in, is a flash — not an entrance.
 *
 * Deliberately not GSAP. This is a CSS transition driven by one
 * IntersectionObserver, so it costs about nothing and runs on every device,
 * including the phones that never load the heavy stack.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  stagger = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** Delay before this block starts, ms. */
  delay?: number;
  /** When set, the direct children are revealed in sequence this many ms apart. */
  stagger?: number;
  as?: "div" | "section" | "ul";
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host || !motionAllowed()) return;

    const targets: HTMLElement[] =
      stagger > 0
        ? (Array.from(host.children) as HTMLElement[])
        : [host as HTMLElement];
    if (targets.length === 0) return;

    // Already in view? It has painted. Leave it exactly as it is.
    if (host.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    targets.forEach((el, i) => {
      el.style.setProperty("--kv-delay", `${delay + i * stagger}ms`);
      el.classList.add("reveal-idle");
    });

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        // `.reveal-run` is authored after `.reveal-idle` in globals.css, so it
        // wins on order alone — the idle class can stay put and the transition
        // runs from the values it set.
        targets.forEach((el) => el.classList.add("reveal-run"));
        observer.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(host);

    return () => observer.disconnect();
  }, [delay, stagger]);

  return (
    // @ts-expect-error — one ref type across the three allowed tags.
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
