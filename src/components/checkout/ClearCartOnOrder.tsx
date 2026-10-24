"use client";

import { useEffect } from "react";
import { useCart } from "@/components/cart/CartProvider";

/**
 * Empty the cart once the customer is standing on a confirmation page for a
 * real order.
 *
 * The PayPal path clears the cart itself, in the browser, the moment the
 * capture returns paid. The card path cannot: the customer leaves the site for
 * a page PayPlus hosts, and clearing before they go would destroy the basket
 * of everyone who changes their mind on the payment screen. So the cart is
 * cleared here instead — on arrival, with an order reference in hand.
 *
 * Renders nothing. Deliberately not conditional on the order being confirmed
 * paid: a buyer who lands here has completed a payment attempt the processor
 * sent to its success URL, and leaving the basket full while the webhook is
 * still in flight invites a second, duplicate order.
 */
export function ClearCartOnOrder() {
  const { clear, hydrated } = useCart();

  useEffect(() => {
    if (hydrated) clear();
  }, [hydrated, clear]);

  return null;
}
