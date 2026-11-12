"use client";

import { useLayoutEffect } from "react";

/**
 * Keeps the video hero's --kv-chrome-h (the banner + header height it slides
 * up under) current. HeroVideo's inline script sets it before the first paint
 * on a full page load; a soft navigation back to the home page doesn't run
 * inline scripts, so this sets it there, before paint as well.
 */
export function HeroChromeOffset() {
  useLayoutEffect(() => {
    const hero = document.getElementById("kv-vhero");
    if (!hero) return;
    const chrome = Array.from(document.querySelectorAll<HTMLElement>("[data-kv-chrome]"));
    const measure = () => hero.style.setProperty("--kv-chrome-h", `${chrome.reduce((total, el) => total + el.offsetHeight, 0)}px`);
    measure();
    const observer = new ResizeObserver(measure);
    chrome.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return null;
}
