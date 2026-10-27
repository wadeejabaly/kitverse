"use client";

import Image from "next/image";
import { useRef, useState } from "react";
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
  const activeSet = sleeve === "long" && imagesLongSleeve?.length ? imagesLongSleeve : images;
  const [active, setActive] = useState(0);
  // Switching sleeve can swap to a shorter or differently-ordered set — jump
  // back to its first (front) photo rather than keep whatever index the
  // reader had picked in the other set, which could now point at the wrong
  // photo. Adjusted during render (React's documented pattern for resetting
  // state when a prop/derived value changes), not in an effect, so the wrong
  // photo never paints even for one frame.
  const previousSet = useRef(activeSet);
  if (previousSet.current !== activeSet) {
    previousSet.current = activeSet;
    if (active !== 0) setActive(0);
  }
  const shown = activeSet[active] ?? activeSet[0];

  return (
    <div>
      <div className="grid aspect-square place-items-center bg-tile">
        {hasPhoto(shown) ? (
          <Image
            src={shown}
            alt={alt}
            width={2048}
            height={2048}
            priority
            sizes="(max-width: 900px) 100vw, 560px"
            className="h-auto w-[90%]"
          />
        ) : (
          <span className="mono-eyebrow text-ink-soft">{t("outOfStock")}</span>
        )}
      </div>

      {activeSet.length > 1 ? (
        <div className="mt-3 flex gap-2">
          {activeSet.map((src, index) => (
            <button
              key={src}
              type="button"
              aria-pressed={index === active}
              aria-label={t("galleryPhoto", { index: index + 1 })}
              onClick={() => setActive(index)}
              className={`aspect-square w-16 overflow-hidden border bg-tile transition-colors ${
                index === active ? "border-ink" : "border-rule hover:border-ink"
              }`}
            >
              <Image
                src={src}
                alt=""
                width={128}
                height={128}
                sizes="64px"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
