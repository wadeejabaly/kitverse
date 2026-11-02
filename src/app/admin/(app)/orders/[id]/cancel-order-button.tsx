"use client";

import { Ban } from "lucide-react";
import { changeOrderStatus } from "../../../orders-actions";
import { button, cx } from "../../../ui";

/**
 * Owner request 2026-11-03: "a way to cancel the order in each step of the way even after i approved
 * it." The generic status dropdown below already lets this through at any stage (changeOrderStatus has
 * no restriction on which status an order can move to next), but burying "Cancelled" in a select next
 * to Produced/At warehouse/With courier makes it easy to miss and easy to pick by accident. This is a
 * dedicated, always-visible, one-click control for exactly that - same action under the hood, with a
 * confirm since it has no undo from here.
 */
export function CancelOrderButton({ orderId, number }: { orderId: string; number: number }) {
  return (
    <form action={changeOrderStatus} onSubmit={(e) => { if (!confirm(`Cancel order #${number}? This can't be undone from here.`)) e.preventDefault(); }}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="status" value="cancelled" />
      <button className={cx(button.ghost, "text-red")}><Ban className="h-4 w-4" /> Cancel order</button>
    </form>
  );
}
