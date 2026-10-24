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
        "flex items-center gap-1.5 transition-colors hover:text-ink",
        className,
      )}
    >
      <CartIcon />
      {showCount ? (
        <Figure className="text-[11px] leading-none">{count}</Figure>
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
      width="16"
      height="16"
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
