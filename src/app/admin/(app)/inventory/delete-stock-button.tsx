"use client";

import { Trash2 } from "lucide-react";
import { deleteInventoryItem } from "../../inventory-actions";
import { button } from "../../ui";

/** One-click remove for a stock row - confirm since there's no undo, same pattern as CancelOrderButton. */
export function DeleteStockButton({ id, label }: { id: string; label: string }) {
  return (
    <form action={deleteInventoryItem} onSubmit={(e) => { if (!confirm(`Remove ${label} from inventory?`)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button className={`${button.subtle} text-red`} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
    </form>
  );
}
