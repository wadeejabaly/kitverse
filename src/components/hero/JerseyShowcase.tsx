"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { MIN_FRAMES_FOR_360, SHOWCASE_SETTINGS, SHOWCASE_STAGE, SHOWCASE_STAGE_PORTRAIT, type ShowcaseStage } from "@/data/showcase";

export type ShowcaseItem = { id: string; title: string; href: string; views: string[] };

type Labels = { prev: string; next: string; rotate: string; open: string };

/**
 * The hero's interactive shirt (owner spec 2026-11-09, "Interactive 360°
 * jersey showcase", and the follow-up "critical fix" the same day).
 *
 * The SHIRT ITSELF is the control: press anywhere on the visible jersey and
 * drag sideways (mouse or finger) to turn it. The angle is continuous and
 * wraps, so it keeps turning in either direction with no end stop; each
 * frame of the shirt's photographed turntable sequence covers 360/N degrees.
 * Releasing keeps the angle (with a little momentum). Rotation is only offered
 * for a shirt that has a real sequence of at least MIN_FRAMES_FOR_360 frames;
 * a shirt with fewer photos is shown still, never faked with a flip.
 *
 * The round buttons sit just outside the sleeves, vertically centred on the
 * shirt, and only switch shirts. They are outside the drag surface, so a
 * click there can never turn the shirt. A quick tap on the shirt (no drag)
 * opens its product page.
 *
 * Integration with the scene: the component fills the hero's video stage
 * (HeroVideo.tsx), whose box is always the playing film's own frame (16:9
 * landscape, 9:16 on portrait screens), and places everything in that frame's
 * pixels (SHOWCASE_STAGE / SHOWCASE_STAGE_PORTRAIT, both written as CSS
 * variables; globals.css picks one per orientation), so the shirt stands on
 * the podium of the film's last frame at every screen size. The stadium's
 * rim light, a soft top-light / bottom-shade pass clipped to the shirt itself
 * (CSS mask of the current frame) and a contact shadow on the podium top tie
 * it into the scene. The phone layout enlarges the shirt about its hem with
 * --kv-shirt-scale; the arrows follow the scaled sleeves.
 *
 * Server-rendered as the first shirt's front, so without JavaScript (or
 * before it loads) the hero is the same still picture.
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
  const [frame, setFrame] = useState(0);
  const [entering, setEntering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const angle = useRef(0);
  const velocity = useRef(0); // degrees per ms, for the release momentum
  const pointer = useRef<{ id: number; x: number; start: number; t: number; lastX: number; lastT: number; moved: boolean } | null>(null);
  const lastInteraction = useRef(0);
  const raf = useRef(0);

  const item = items[index];
  const frames = item.views;
  const rotatable = frames.length >= MIN_FRAMES_FOR_360;
  const count = rotatable ? frames.length : 1;
  const S = SHOWCASE_STAGE;

  // Both geometries as CSS variables (--sc-<name>-l / -p); globals.css maps
  // --sc-<name> to the one for the screen's orientation.
  const geometry = useMemo(
    () => ({ ...placeVars(SHOWCASE_STAGE, "l"), ...placeVars(SHOWCASE_STAGE_PORTRAIT, "p") }) as React.CSSProperties,
    [],
  );
  const layout = {
    frame: { left: "var(--sc-frame-left)", top: "var(--sc-frame-top)", width: "var(--sc-frame-width)", height: "var(--sc-frame-height)" },
    origin: "var(--sc-origin)",
    arrowY: "var(--sc-arrow-y)",
    arrowLeft: "var(--sc-arrow-left)",
    arrowRight: "var(--sc-arrow-right)",
    shadow: { left: "var(--sc-shadow-left)", top: "var(--sc-shadow-top)", width: "var(--sc-shadow-width)", height: "var(--sc-shadow-height)" },
  };

  /** Angle (degrees, any value) -> frame index, wrapping both ways. */
  const show = useCallback(
    (deg: number) => {
      angle.current = deg;
      if (!rotatable) return;
      const step = 360 / count;
      const next = ((Math.round(deg / step) % count) + count) % count;
      setFrame((current) => (current === next ? current : next));
    },
    [count, rotatable],
  );

  const stopMotion = () => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    velocity.current = 0;
  };

  /** Switch shirt; the new one starts from its front. */
  const go = useCallback(
    (delta: number) => {
      stopMotion();
      lastInteraction.current = Date.now();
      angle.current = 0;
      setFrame(0);
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

  // Warm only the shirts one arrow-press away (next, then previous), in idle
  // time and never while the home page film is playing, so the film has the
  // bandwidth. Anything further loads when it is reached; frames are ~50 KB.
  useEffect(() => {
    const queue = [...new Set([(index + 1) % items.length, (index - 1 + items.length) % items.length])].filter((i) => i !== index);
    let cancelled = false;
    let observer: MutationObserver | undefined;
    const idle = (fn: () => void) => {
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(fn, { timeout: 3000 });
      else setTimeout(fn, 500);
    };
    const next = () => {
      if (cancelled || !queue.length) return;
      for (const src of items[queue.shift()!].views) {
        const img = new window.Image();
        img.decoding = "async";
        img.src = src;
      }
      idle(next);
    };
    const hero = document.getElementById("kv-vhero");
    if (hero?.getAttribute("data-intro") === "playing") {
      observer = new MutationObserver(() => {
        if (hero.getAttribute("data-intro") === "playing") return;
        observer?.disconnect();
        idle(next);
      });
      observer.observe(hero, { attributes: true, attributeFilter: ["data-intro"] });
    } else {
      idle(next);
    }
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [index, items]);

  // Idle auto-turn: a slow continuous spin, only while visible and nobody is
  // touching the shirt; never with reduced motion. One rAF loop, stopped
  // whenever it has nothing to do.
  useEffect(() => {
    if (!rotatable || !SHOWCASE_SETTINGS.autoRotate || reducedMotion()) return;
    const el = surfaceRef.current;
    let visible = true;
    const io = el ? new IntersectionObserver(([entry]) => (visible = entry.isIntersecting)) : null;
    if (el && io) io.observe(el);
    let loop = 0;
    let last = 0;
    const tick = (t: number) => {
      const idle = Date.now() - lastInteraction.current > SHOWCASE_SETTINGS.idleMs;
      if (visible && !document.hidden && idle && !pointer.current && !raf.current) {
        if (last) show(angle.current + ((t - last) / 1000) * SHOWCASE_SETTINGS.degreesPerSecond);
        last = t;
      } else {
        last = 0;
      }
      loop = requestAnimationFrame(tick);
    };
    // Poll cheaply while idle-waiting; the rAF loop only runs while spinning.
    const poll = window.setInterval(() => {
      const idle = Date.now() - lastInteraction.current > SHOWCASE_SETTINGS.idleMs;
      if (idle && visible && !document.hidden && !loop) loop = requestAnimationFrame(tick);
      if ((!idle || !visible || document.hidden) && loop) {
        cancelAnimationFrame(loop);
        loop = 0;
        last = 0;
      }
    }, 500);
    return () => {
      window.clearInterval(poll);
      cancelAnimationFrame(loop);
      io?.disconnect();
    };
  }, [rotatable, show, index]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Degrees per pixel: one full turn = dragging about 1.4x the shirt's width.
  const degPerPx = () => 360 / ((surfaceRef.current?.offsetWidth ?? 400) * 1.4);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    stopMotion();
    lastInteraction.current = Date.now();
    const now = performance.now();
    pointer.current = { id: event.pointerId, x: event.clientX, start: angle.current, t: now, lastX: event.clientX, lastT: now, moved: false };
    if (rotatable) {
      // Keep receiving the moves even if the cursor leaves the shirt mid-drag.
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* synthetic or already-released pointer */
      }
      if (event.pointerType === "mouse") event.preventDefault(); // no text selection / image ghost
      setDragging(true);
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const p = pointer.current;
    if (!p || p.id !== event.pointerId) return;
    const dx = event.clientX - p.x;
    if (!p.moved && Math.abs(dx) > 3) p.moved = true;
    if (!p.moved || !rotatable) return;
    lastInteraction.current = Date.now();
    const now = performance.now();
    const dt = Math.max(1, now - p.lastT);
    // Dragging right turns the shirt to show its left side, like turning a real one.
    velocity.current = (-(event.clientX - p.lastX) * degPerPx()) / dt;
    p.lastX = event.clientX;
    p.lastT = now;
    show(p.start - dx * degPerPx());
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const p = pointer.current;
    if (!p || p.id !== event.pointerId) return;
    pointer.current = null;
    setDragging(false);
    lastInteraction.current = Date.now();
    if (cancelled) return;
    if (!p.moved) {
      // A quick tap (not a press-and-hold) opens the shirt.
      if (performance.now() - p.t < 350) router.push(item.href);
      return;
    }
    // Momentum: keep turning in the drag direction and ease out.
    if (!rotatable || reducedMotion() || performance.now() - p.lastT > 80) return;
    let v = Math.max(-0.9, Math.min(0.9, velocity.current));
    let last = performance.now();
    const spin = (t: number) => {
      const dt = t - last;
      last = t;
      v *= Math.pow(0.994, dt);
      if (Math.abs(v) < 0.01) {
        raf.current = 0;
        return;
      }
      show(angle.current + v * dt);
      lastInteraction.current = Date.now();
      raf.current = requestAnimationFrame(spin);
    };
    raf.current = requestAnimationFrame(spin);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (rotatable && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      stopMotion();
      lastInteraction.current = Date.now();
      show(angle.current + (event.key === "ArrowRight" ? -1 : 1) * (360 / count));
    } else if (event.key === "Enter") {
      router.push(item.href);
    }
  };

  const pad = (n: number) => String(n).padStart(2, "0");
  const multi = items.length > 1;
  const current = frames[rotatable ? frame : 0];

  return (
    <div className="kv-showcase absolute inset-0" style={geometry}>
      {/* The shirt on the podium: contact shadow + the jersey, scaled and
          revealed together about the hem. */}
      <div className="kv-showcase-stage absolute inset-0" style={{ transformOrigin: layout.origin }}>
        <span aria-hidden className="kv-showcase-contact" style={layout.shadow} />

        {/* The jersey: the drag surface. */}
        <div
          ref={surfaceRef}
          key={item.id}
          role={rotatable ? "slider" : "link"}
          aria-label={item.title}
          aria-roledescription={rotatable ? labels.rotate : undefined}
          aria-valuemin={rotatable ? 0 : undefined}
          aria-valuemax={rotatable ? 359 : undefined}
          aria-valuenow={rotatable ? Math.round((frame * 360) / count) : undefined}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => endDrag(event)}
          onPointerCancel={(event) => endDrag(event, true)}
          onLostPointerCapture={() => {
            pointer.current = null;
            setDragging(false);
          }}
          onKeyDown={onKeyDown}
          onDragStart={(event) => event.preventDefault()}
          className={`kv-showcase-surface absolute ${entering ? "kv-showcase-enter" : ""} ${
            rotatable ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer"
          }`}
          style={layout.frame}
        >
          {/* Every frame of this shirt is in the DOM (stacked, only one
              visible), so turning never waits on a download or a decode. */}
          {(rotatable ? frames : frames.slice(0, 1)).map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- pre-sized transparent frames swapped every few pixels of drag
            <img
              key={src}
              src={src}
              alt={i === 0 ? item.title : ""}
              width={S.frame.width}
              height={S.frame.height}
              draggable={false}
              decoding="async"
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={priority && index === 0 && i === 0 ? "high" : "auto"}
              className="kv-showcase-img"
              style={{ visibility: i === (rotatable ? frame : 0) ? "visible" : "hidden" }}
            />
          ))}
          {/* Scene light on the shirt only: masked by the visible frame. */}
          <span
            aria-hidden
            className="kv-showcase-light"
            style={{ WebkitMaskImage: `url(${current})`, maskImage: `url(${current})` }}
          />
        </div>
      </div>

      {multi ? (
        <>
          <ShowcaseArrow
            side="prev"
            label={`${labels.prev}: ${items[(index - 1 + items.length) % items.length].title}`}
            onClick={() => go(-1)}
            style={{ left: layout.arrowLeft, top: layout.arrowY }}
          />
          <ShowcaseArrow
            side="next"
            label={`${labels.next}: ${items[(index + 1) % items.length].title}`}
            onClick={() => go(1)}
            style={{ right: layout.arrowRight, top: layout.arrowY }}
          />
        </>
      ) : null}

      {/* A quiet caption only — never a control. */}
      <div className="kv-showcase-meta" aria-hidden>
        {multi ? (
          <span className="kv-showcase-count" dir="ltr" style={{ unicodeBidi: "isolate" }}>
            <strong>{pad(index + 1)}</strong> / {pad(items.length)}
          </span>
        ) : null}
        {rotatable ? <span className="kv-showcase-hint">{labels.rotate}</span> : null}
      </div>
      <span className="sr-only" aria-live="polite">
        {item.title}
      </span>
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d={side === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** One geometry as percentages of its film frame, under a variable suffix. */
function placeVars(S: ShowcaseStage, suffix: string): Record<string, string> {
  const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;
  // The shirt scales about its hem (--kv-shirt-scale), so the arrows'
  // positions are the unscaled offsets from the hem times that scale.
  const scaled = (base: number, offset: number, of: number) => `calc(${pct(base, of)} + ${pct(offset, of)} * var(--kv-shirt-scale, 1))`;
  const shadowHeight = S.shadowWidth * 0.094;
  const values: Record<string, string> = {
    "frame-left": pct(S.frame.x, S.width),
    "frame-top": pct(S.frame.y, S.height),
    "frame-width": pct(S.frame.width, S.width),
    "frame-height": pct(S.frame.height, S.height),
    origin: `${pct(S.shirt.cx, S.width)} ${pct(S.shirt.bottom, S.height)}`,
    "arrow-y": scaled(S.shirt.bottom, -(S.shirt.bottom - S.shirt.top) / 2, S.height),
    "arrow-left": scaled(S.shirt.cx, -(S.shirt.cx - S.shirt.left), S.width),
    "arrow-right": scaled(S.width - S.shirt.cx, -(S.shirt.right - S.shirt.cx), S.width),
    "shadow-left": pct(S.shirt.cx - S.shadowWidth / 2, S.width),
    "shadow-top": pct(S.shirt.bottom - shadowHeight / 2, S.height),
    "shadow-width": pct(S.shadowWidth, S.width),
    "shadow-height": pct(shadowHeight, S.height),
    "meta-left": pct(S.shirt.cx, S.width),
  };
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [`--sc-${key}-${suffix}`, value]));
}
