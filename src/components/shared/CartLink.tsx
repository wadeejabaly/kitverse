"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCart } from "@/components/cart/CartProvider";
import { Figure } from "@/components/shared/Money";
import { cn } from "@/lib/utils";

/**
 * The header's cart link with a live count.
 *
 * The count is withheld until the provider has read localStorage: the server
 * cannot know it, so rendering "0" first and correcting it would flash a wrong
 * number on every page load. The label alone is the server-neutral state.
 */
export function CartLink({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const { count, hydrated } = useCart();

  return (
    <Link
      href="/cart"
      className={cn("transition-colors hover:text-ink", className)}
    >
      {t("cart")}
      {hydrated && count > 0 ? (
        <>
          {" "}
          <Figure>({count})</Figure>
        </>
      ) : null}
    </Link>
  );
}
