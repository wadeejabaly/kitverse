"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useProductSleeve } from "@/components/product/ProductSleeveContext";
import { hasPhoto } from "@/lib/product";

/**
 * The PDP's photo tile. Almost every product today has exactly one photo —
 * `images.length === 1` — in which case this renders byte-for-byte what the
 * single-image tile used to: no thumbnail row, no extra DOM, no client state
 * that does anything. The gallery only appears once a product has more than
 * one photo (see Product.images in src/data/types.ts).
 *
 * LCP safety carries over unchanged from the single-image version this
 * replaces: `images[0]` is what SSRs and hydrates as the active photo (a
 * static initial useState, not something JS has to compute), so it still
 * paints on frame one with `priority` regardless of whether this component
 * has hydrated yet. Only the thumbnail row needs the client.
 *
 * Long sleeve (owner decision 2026-10-26): when the shopper picks "Long
 * sleeve" in <ProductForm> (the choice lives in <ProductSleeveProvider>,
 * their shared parent on the page) and this product has `imagesLongSleeve`,
 * the tile swaps to that set instead. Most products have no such set yet —
 * the toggle is offered everywhere ahead of the photos that will back it
 * shirt by shirt — so `shown` falls back to the normal set, unchanged.
 */
export function ProductGallery({
  images,
  imagesLongSleeve,
  alt,
}: {
  images: string[];
  imagesLongSleeve?: string[];
  alt: string;
}) {
  const t = useTranslations("product");
  const [sleeve] = useProductSleeve();
  const setKey = sleeve === "long" && imagesLongSleeve?.length ? "long" : "short";
  const activeSet = setKey === "long" ? imagesLongSleeve! : images;
  const [active, setActive] = useState(0);
  // Switching sleeve can swap to a shorter or differently-ordered set — jump
  // back to its first (front) photo rather than keep whatever index the
  // reader had picked in the other set, which could now point at the wrong
  // photo. Adjusted during render (React's documented pattern for resetting
  // state when a value changes: previous value kept in state), not in an
  // effect, so the wrong photo never paints even for one frame.
  const [shownKey, setShownKey] = useState(setKey);
  if (shownKey !== setKey) {
    setShownKey(setKey);
    setActive(0);
  }
  const shown = activeSet[active] ?? activeSet[0];
  const count = activeSet.length;

  // Redesign phase 2 (2026-11-09): hover-zoom on a fine pointer (the photo
  // scales 2x around the cursor, a transform only), and a full-screen viewer
  // on click/tap with previous/next. Both are layered on top of the same
  // SSR'd first photo, so the LCP story above is unchanged.
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [viewer, setViewer] = useState(false);
  const step = (delta: number) => setActive((current) => (current + delta + count) % count);

  useEffect(() => {
    if (!viewer) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewer(false);
      const rtl = document.documentElement.dir === "rtl";
      if (event.key === "ArrowRight") setActive((c) => (c + (rtl ? -1 : 1) + count) % count);
      if (event.key === "ArrowLeft") setActive((c) => (c + (rtl ? 1 : -1) + count) % count);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [viewer, count]);

  return (
    <div>
      <div className="kv-panel relative overflow-hidden" style={{ background: "#f1f3f7" }}>
        {hasPhoto(shown) ? (
          <button
            type="button"
            onClick={() => setViewer(true)}
            onPointerMove={(event) => {
              if (event.pointerType !== "mouse") return;
              const rect = event.currentTarget.getBoundingClientRect();
              setZoom({
                x: ((event.clientX - rect.left) / rect.width) * 100,
                y: ((event.clientY - rect.top) / rect.height) * 100,
              });
            }}
            onPointerLeave={() => setZoom(null)}
            aria-label={t("zoomPhoto")}
            className="grid aspect-square w-full cursor-zoom-in place-items-center overflow-hidden"
          >
            <Image
              src={shown}
              alt={alt}
              width={2048}
              height={2048}
              priority
              sizes="(max-width: 900px) 100vw, 600px"
              className="aspect-square h-auto w-full object-contain transition-transform duration-200 ease-out"
              style={
                zoom
                  ? { transform: "scale(2)", transformOrigin: `${zoom.x}% ${zoom.y}%` }
                  : undefined
              }
            />
          </button>
        ) : (
          <div className="grid aspect-square place-items-center">
            <span className="mono-eyebrow text-ink-soft">{t("outOfStock")}</span>
          </div>
        )}

        {count > 1 ? (
          <>
            <GalleryArrow side="prev" label={t("galleryPrev")} onClick={() => step(-1)} />
            <GalleryArrow side="next" label={t("galleryNext")} onClick={() => step(1)} />
          </>
        ) : null}
        <span aria-hidden className="pointer-events-none absolute end-3 bottom-3 hidden items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 text-[12px] font-semibold text-[#0e1630] shadow-sm wide:flex">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="7" cy="7" r="4.6" />
            <path d="M10.4 10.4 14 14M5 7h4M7 5v4" strokeLinecap="round" />
          </svg>
          {t("zoomHint")}
        </span>
      </div>

      {count > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeSet.map((src, index) => (
            <button
              key={src}
              type="button"
              aria-pressed={index === active}
              aria-label={t("galleryPhoto", { index: index + 1 })}
              onClick={() => setActive(index)}
              className={`aspect-square w-[72px] overflow-hidden rounded-[10px] border-2 bg-tile transition-colors ${
                index === active ? "border-[#1f5cff]" : "border-rule hover:border-ink"
              }`}
            >
              <Image
                src={src}
                alt=""
                width={144}
                height={144}
                sizes="72px"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      {viewer && hasPhoto(shown) ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-[70] flex flex-col bg-[#050918]/95"
          onClick={() => setViewer(false)}
        >
          <div className="flex items-center justify-between px-4 py-3 text-white/80">
            <span className="latin text-sm">
              {active + 1} / {count}
            </span>
            <button
              type="button"
              onClick={() => setViewer(false)}
              aria-label={t("closeViewer")}
              className="grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 3l10 10M13 3 3 13" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="relative min-h-0 flex-1" onClick={(event) => event.stopPropagation()}>
            <Image src={shown} alt={alt} fill sizes="100vw" className="object-contain p-4" />
            {count > 1 ? (
              <>
                <GalleryArrow side="prev" label={t("galleryPrev")} onClick={() => step(-1)} dark />
                <GalleryArrow side="next" label={t("galleryNext")} onClick={() => step(1)} dark />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Previous/next buttons — logical sides, chevrons mirrored in RTL. */
function GalleryArrow({
  side,
  label,
  onClick,
  dark = false,
}: {
  side: "prev" | "next";
  label: string;
  onClick: () => void;
  dark?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full shadow-md transition-colors ${
        side === "prev" ? "start-3" : "end-3"
      } ${dark ? "bg-white/15 text-white hover:bg-white/25" : "bg-white/90 text-[#0e1630] hover:bg-white"}`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={side === "prev" ? "rotate-180 rtl:rotate-0" : "rtl:rotate-180"}
      >
        <path d="M6 3.5 10.5 8 6 12.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
