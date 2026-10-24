"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";

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
 */
export function ProductGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const t = useTranslations("product");
  const [active, setActive] = useState(0);
  const shown = images[active] ?? images[0];

  return (
    <div>
      <div className="grid aspect-square place-items-center bg-tile">
        <Image
          src={shown}
          alt={alt}
          width={2048}
          height={2048}
          priority
          sizes="(max-width: 900px) 100vw, 560px"
          className="h-auto w-[90%]"
        />
      </div>

      {images.length > 1 ? (
        <div className="mt-3 flex gap-2">
          {images.map((src, index) => (
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
