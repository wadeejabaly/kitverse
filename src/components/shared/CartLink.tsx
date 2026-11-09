"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCart } from "@/components/cart/CartProvider";
import { Figure } from "@/components/shared/Money";
import { cn } from "@/lib/utils";

/**
 * The header's cart link: a bag glyph with a live count beside it.
 *
 * The count is withheld until the provider has read localStorage: the server
 * cannot know it, so rendering "0" first and correcting it would flash a wrong
 * number on every page load. The icon alone is the server-neutral state.
 *
 * The glyph replaced the word "Cart", so the link now carries an aria-label —
 * and the labelled form includes the count, because a screen reader user
 * otherwise loses the number entirely. Both label strings already exist in
 * ar and en (nav.cart / nav.cartWithCount); the count is interpolated as a
 * STRING so next-intl cannot render ٣ in Arabic. Latin numerals always.
 */
export function CartLink({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const { count, hydrated } = useCart();
  const showCount = hydrated && count > 0;

  return (
    <Link
      href="/cart"
      aria-label={
        showCount ? t("cartWithCount", { count: String(count) }) : t("cart")
      }
      className={cn(
        "relative flex items-center transition-colors hover:text-ink",
        className,
      )}
    >
      <CartIcon />
      {/* The count as a small electric-blue disc on the bag's corner
          (redesign 2026-11-09, reference screenshots). Still withheld until
          hydrated — see above. */}
      {showCount ? (
        <Figure className="absolute -end-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-electric px-1 text-[10px] leading-4 font-bold text-accent-ink">
          {count}
        </Figure>
      ) : null}
    </Link>
  );
}

/**
 * A bag, drawn at the same hairline weight as the header's search glyph.
 *
 * It is symmetric about its vertical centre line on purpose: a conventional
 * trolley glyph points somewhere, and pointing is a direction — it would need
 * mirroring in Arabic. This one is identical in both directions, so there is
 * no transform and nothing to get wrong.
 */
function CartIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden
      className="block"
    >
      <path d="M3.2 5.5h9.6l-.8 8.3H4z" strokeLinejoin="round" />
      <path d="M6 7.2V4.8a2 2 0 0 1 4 0v2.4" strokeLinecap="round" />
    </svg>
  );
}
