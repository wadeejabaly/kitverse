import { returnOrderToInventory, skipInventoryReturn } from "../../../inventory-actions";
import { Card, SectionTitle, button } from "../../../ui";
import type { BatchLine } from "@/lib/orders/admin";

/**
 * Owner request 2026-11-04, verbatim: "i want it to ask me first, because not every cancelled order
 * might be inventory" - shown once on a cancelled order (while returned_to_inventory_at is still
 * null), defaulting every box UNCHECKED so nothing is added by accident. "Add checked" and "Skip" both
 * go through inventory-actions.ts, which marks the order resolved either way so this stops showing.
 */
export function CancelInventoryPrompt({ orderId, lines }: { orderId: string; lines: BatchLine[] }) {
  const trackable = lines.filter((l) => l.product_id);
  return (
    <Card accent="amber">
      <SectionTitle>Add these back to inventory?</SectionTitle>
      <p className="mb-3 text-sm text-muted">This order was cancelled. Check any items you&apos;re actually keeping on hand - not every cancelled order has stock to return.</p>
      {trackable.length ? (
        <form action={returnOrderToInventory} className="flex flex-col gap-2 text-sm">
          <input type="hidden" name="orderId" value={orderId} />
          {trackable.map((l) => (
            <label key={l.id} className="flex items-start gap-2.5 rounded-xl bg-paper p-3">
              <input type="checkbox" name="orderItemId" value={l.id} className="mt-0.5 h-4 w-4 accent-[var(--pitch)]" />
              <span>{l.title}<span className="text-muted"> · {l.version}, {l.sleeve} sleeve, {l.size}{l.qty > 1 ? ` ×${l.qty}` : ""}</span></span>
            </label>
          ))}
          <button className={`${button.primary} mt-1 self-start`}>Add checked to inventory</button>
        </form>
      ) : (
        <p className="mb-3 text-sm text-muted">None of these items have a catalog match to track stock against.</p>
      )}
      <form action={skipInventoryReturn} className="mt-2">
        <input type="hidden" name="orderId" value={orderId} />
        <button className={`${button.ghost} text-xs`}>None of these - skip</button>
      </form>
    </Card>
  );
}
