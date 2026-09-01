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
 * The alt is always the brand name: no surface pairs the crest with wordmark
 * text any more, so in every placement the badge is the only thing naming the
 * brand — and in the header it is what gives the home link its accessible
 * name.
 */
export function BrandBadge({
  size,
  priority = false,
  className,
}: {
  size: number;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src="/brand/badge.png"
      alt="KitVerse"
      width={size}
      height={size}
      priority={priority}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
