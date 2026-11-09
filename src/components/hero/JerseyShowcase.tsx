"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { SHOWCASE_SETTINGS, SHOWCASE_STAGE } from "@/data/showcase";

export type ShowcaseItem = { id: string; title: string; href: string; views: string[] };

type Labels = { prev: string; next: string; rotate: string; open: string };

/**
 * The hero's interactive shirt (owner spec 2026-11-09, "Interactive 360°
 * jersey showcase"): the SAME pedestal picture as before, with the shirt now
 * a separate layer the shopper can turn and swap.
 *
 *   - Drag / swipe sideways turns the shirt through its real photographed
 *     views. With a few views (2-7) each change is a quick "turn" (the frame
 *     narrows and opens on the next side) rather than a fake in-between; with
 *     8+ views it scrubs frame by frame.
 *   - The two round buttons sit just outside the shirt's sleeves, vertically
 *     centred on the shirt (positions come from SHOWCASE_STAGE.shirt, so they
 *     follow the picture at every width). They switch shirts and never turn
 *     the current one.
 *   - A tap without dragging opens the shirt's product page.
 *   - Optional slow auto-turn when idle (SHOWCASE_SETTINGS), off for
 *     prefers-reduced-motion, paused off-screen and in background tabs.
 *
 * Server-rendered as the plate + the first shirt's front, so without
 * JavaScript (or before it loads) the hero looks exactly as it does today.
 */
export function JerseyShowcase({
  items,
  labels,
  priority = false,
}: {
  items: ShowcaseItem[];
  labels: Labels;
  priority?: boolean;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [view, setView] = useState(0);
  const [entering, setEntering] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLImageElement>(null);
  const angle = useRef(0);
  const drag = useRef<{ id: number; x: number; start: number; moved: boolean } | null>(null);
  const lastInteraction = useRef(0);
  const turning = useRef(false);
  const target = useRef(0);

  const item = items[index];
  const count = item.views.length;
  const step = 360 / count;
  const scrub = count >= 8;
  const S = SHOWCASE_STAGE;

  // Where the frame layer and the arrows sit, as % of the plate.
  const layout = useMemo(() => {
    const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;
    return {
      frame: {
        left: pct(S.frame.x, S.width),
        top: pct(S.frame.y, S.height),
        width: pct(S.frame.width, S.width),
        height: pct(S.frame.height, S.height),
      },
      arrowY: pct((S.shirt.top + S.shirt.bottom) / 2, S.height),
      arrowLeft: pct(S.shirt.left, S.width),
      arrowRight: pct(S.width - S.shirt.right, S.width),
    };
  }, [S]);

  /** Show view `next`: a short turn for few-view shirts, an instant swap when scrubbing. */
  const showView = useCallback(
    (next: number) => {
      if (target.current === next) return;
      target.current = next;
      const el = frameRef.current;
      if (scrub || !el || typeof el.animate !== "function" || reducedMotion()) {
        setView(next);
        return;
      }
      if (turning.current) return; // the running turn opens on the latest target
      // Narrow the current side, then open on the next one.
      turning.current = true;
      el.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0.04)" }], {
        duration: 120,
        easing: "cubic-bezier(.5,0,.9,.6)",
      }).finished.then(() => {
        setView(target.current);
        requestAnimationFrame(() => {
          el.animate([{ transform: "scaleX(0.04)" }, { transform: "scaleX(1)" }], {
            duration: 150,
            easing: "cubic-bezier(.1,.4,.5,1)",
          }).finished.finally(() => {
            turning.current = false;
          });
        });
      });
    },
    [scrub],
  );

  const viewForAngle = useCallback(
    (deg: number) => ((Math.round(deg / step) % count) + count) % count,
    [count, step],
  );

  const setAngle = useCallback(
    (deg: number) => {
      angle.current = deg;
      showView(viewForAngle(deg));
    },
    [showView, viewForAngle],
  );

  /** Switch shirt; the new one always starts from its front. */
  const go = useCallback(
    (delta: number) => {
      lastInteraction.current = Date.now();
      angle.current = 0;
      target.current = 0;
      turning.current = false;
      setView(0);
      setIndex((i) => (i + delta + items.length) % items.length);
      setEntering(true);
    },
    [items.length],
  );

  useEffect(() => {
    if (!entering) return;
    const id = window.setTimeout(() => setEntering(false), 380);
    return () => window.clearTimeout(id);
  }, [entering, index]);

  // Progressive loading: this shirt's other views first, then the neighbours,
  // then the rest — one shirt at a time, in idle time.
  useEffect(() => {
    const order = [index, (index + 1) % items.length, (index - 1 + items.length) % items.length, ...items.keys()];
    const seen = new Set<number>();
    const queue = order.filter((i) => (seen.has(i) ? false : (seen.add(i), true)));
    let cancelled = false;
    const idle = (fn: () => void) => {
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(fn, { timeout: 2500 });
      else setTimeout(fn, 400);
    };
    const next = () => {
      if (cancelled || !queue.length) return;
      const i = queue.shift()!;
      for (const src of items[i].views) {
        const img = new window.Image();
        img.decoding = "async";
        img.src = src;
      }
      idle(next);
    };
    idle(next);
    return () => {
      cancelled = true;
    };
  }, [index, items]);

  // Idle auto-turn (or, when it is switched off, ease back to the front).
  useEffect(() => {
    if (count < 2 || reducedMotion()) return;
    const el = stageRef.current;
    let visible = true;
    const io = el ? new IntersectionObserver(([entry]) => (visible = entry.isIntersecting)) : null;
    if (el && io) io.observe(el);
    const tickMs = SHOWCASE_SETTINGS.autoRotate ? Math.max(120, (step / SHOWCASE_SETTINGS.degreesPerSecond) * 1000) : 1000;
    const id = window.setInterval(() => {
      if (!visible || document.hidden || drag.current) return;
      if (Date.now() - lastInteraction.current < SHOWCASE_SETTINGS.idleMs) return;
      if (SHOWCASE_SETTINGS.autoRotate) setAngle(angle.current + step);
      else if (viewForAngle(angle.current) !== 0) setAngle(0);
    }, tickMs);
    return () => {
      window.clearInterval(id);
      io?.disconnect();
    };
  }, [count, step, setAngle, viewForAngle]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    lastInteraction.current = Date.now();
    drag.current = { id: event.pointerId, x: event.clientX, start: angle.current, moved: false };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 6) {
      d.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (!d.moved) return;
    lastInteraction.current = Date.now();
    const width = stageRef.current?.offsetWidth ?? 400;
    // One full turn = dragging about the stage's width; dragging right turns the shirt right.
    setAngle(d.start - (dx / width) * 360);
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== event.pointerId) return;
    lastInteraction.current = Date.now();
    if (!d.moved) router.push(item.href);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      lastInteraction.current = Date.now();
      setAngle(angle.current + (event.key === "ArrowRight" ? -step : step));
    } else if (event.key === "Enter") {
      router.push(item.href);
    }
  };

  const pad = (n: number) => String(n).padStart(2, "0");
  const multi = items.length > 1;

  return (
    <div className="kv-showcase relative">
      {/* The picture: same plate, same size, same feathered edges as before. */}
      <div
        ref={stageRef}
        role="group"
        aria-roledescription={labels.rotate}
        aria-label={`${item.title} — ${labels.open}`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={onKeyDown}
        className={`kv-stadium-shirt kv-showcase-stage relative block ${count > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
      >
        <Image
          src={S.plate}
          alt=""
          width={S.width}
          height={S.height}
          priority={priority}
          sizes="(max-width: 900px) 64vw, 560px"
          className="pointer-events-none h-auto w-full select-none"
          draggable={false}
        />
        <div
          key={item.id}
          className={`kv-showcase-frame pointer-events-none absolute ${entering ? "kv-showcase-enter" : ""}`}
          style={layout.frame}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized transparent frames, swapped instantly while dragging */}
          <img
            ref={frameRef}
            src={item.views[view]}
            alt={item.title}
            width={S.frame.width}
            height={S.frame.height}
            draggable={false}
            decoding="async"
            fetchPriority={index === 0 && view === 0 ? "high" : "auto"}
            className="h-full w-full select-none object-contain"
          />
        </div>
      </div>

      {multi ? (
        <>
          <ShowcaseArrow side="prev" label={`${labels.prev}: ${items[(index - 1 + items.length) % items.length].title}`} onClick={() => go(-1)} style={{ left: layout.arrowLeft, top: layout.arrowY }} />
          <ShowcaseArrow side="next" label={`${labels.next}: ${items[(index + 1) % items.length].title}`} onClick={() => go(1)} style={{ right: layout.arrowRight, top: layout.arrowY }} />
        </>
      ) : null}

      <div className="kv-showcase-meta" aria-live="polite">
        {multi ? (
          <span className="kv-showcase-count" dir="ltr" style={{ unicodeBidi: "isolate" }}>
            <strong>{pad(index + 1)}</strong> / {pad(items.length)}
          </span>
        ) : null}
        {count > 1 ? (
          <span className="kv-showcase-hint">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M3 12a9 4 0 0 0 18 0M21 12a9 4 0 0 0-14.5-3.2" strokeLinecap="round" />
              <path d="M5 6.5 6.5 8.8 9 7.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {labels.rotate}
          </span>
        ) : null}
        <span className="sr-only">{item.title}</span>
      </div>
    </div>
  );
}

function ShowcaseArrow({
  side,
  label,
  onClick,
  style,
}: {
  side: "prev" | "next";
  label: string;
  onClick: () => void;
  style: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      className={`kv-showcase-arrow kv-showcase-arrow--${side}`}
      style={style}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d={side === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
