"use client";

import { useEffect, useState } from "react";

/**
 * Time left until the Black Friday sale ends, inside the black top strip (owner request
 * 2026-11-23: "a countdown until it ends"). Ticks every second by the shopper's clock; renders
 * nothing before hydration (static page - a server number would be stale) or after the end.
 */
/** "7 days" in the shopper's language (Arabic / Hebrew plural forms). */
function daysWord(n: number, lang: string): string {
  if (lang === "ar") return n === 1 ? "يوم" : n === 2 ? "يومين" : n <= 10 ? `${n} أيام` : `${n} يوم`;
  if (lang === "he") return n === 1 ? "יום" : n === 2 ? "יומיים" : `${n} ימים`;
  return n === 1 ? "1 day" : `${n} days`;
}

export function StripCountdown({ to, label, lang }: { to: string; label: string; lang: string }) {
  const target = Date.parse(to);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  if (now === null || !Number.isFinite(target) || now >= target) return null;

  const left = Math.floor((target - now) / 1000);
  const d = Math.floor(left / 86400);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(Math.floor((left % 86400) / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`;
  return (
    <span className="kv-bf-strip-timer" role="timer" aria-live="off">
      <span className="kv-bf-strip-timer-label">{label}</span>
      {d > 0 ? <b>{daysWord(d, lang)}</b> : null}
      {d > 0 ? <span aria-hidden className="opacity-50">·</span> : null}
      <b dir="ltr" className="latin tabular-nums">{clock}</b>
    </span>
  );
}
