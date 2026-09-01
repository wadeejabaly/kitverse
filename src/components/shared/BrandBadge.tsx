import Image from "next/image";

/**
 * The KitVerse club crest.
 *
 * One component so the header, the mobile overlay and the footer all draw the
 * same mark at the same source. The artwork is a real transparent cutout
 * (public/brand/badge.png), so it sits on the ground in either theme without a
 * plate behind it — nothing here changes between light and dark.
 *
 * It carries no colour of its own into the UI: the crest's electric blue lives
 * inside the image and is never a token.
 *
 * `alt` defaults to the brand name, but pass `alt=""` wherever the badge sits
 * beside the visible wordmark (header, mobile overlay): the mark and the word
 * are one lockup, and labelling both makes a screen reader say "KitVerse"
 * twice. The footer badge is the only brand name in its row, so it keeps the
 * label.
 */
export function BrandBadge({
  size,
  priority = false,
  className,
  alt = "KitVerse",
}: {
  size: number;
  priority?: boolean;
  className?: string;
  alt?: string;
}) {
  return (
    <Image
      src="/brand/badge.png"
      alt={alt}
      width={size}
      height={size}
      priority={priority}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
