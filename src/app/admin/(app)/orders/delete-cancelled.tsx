"use client";

import { useActionState, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteCancelledOrders, type DeleteOrdersState } from "../../orders-actions";
import { button, cx } from "../../ui";

const INITIAL: DeleteOrdersState = { done: false, deleted: [], skipped: [] };

/**
 * "Delete" for cancelled orders (owner request 2026-11-13). Two steps - the first click only asks,
 * the second deletes for good - then says what was deleted and what was kept (an order with money,
 * an invoice or a cash/issue record is never deleted; see deleteCancelledOrders()).
 *  - `orderId` set: one order (its own page);
 *  - otherwise: every cancelled order (the Cancelled tab), `count` of them.
 */
export function DeleteCancelledOrders({ orderId, number, count }: { orderId?: string; number?: number; count?: number }) {
  const [state, action, pending] = useActionState(deleteCancelledOrders, INITIAL);
  const [asking, setAsking] = useState(false);
  const single = !!orderId;
  if (state.done) {
    return (
      <div className="kv-card mb-3 px-4 py-3 text-sm" role="status">
        {state.error ? <p className="text-red">{state.error}</p> : null}
        {state.deleted.length ? <p className="text-ink">Deleted {state.deleted.length} order{state.deleted.length === 1 ? "" : "s"}: {state.deleted.map((n) => `#${n}`).join(", ")}.</p> : null}
        {state.skipped.length ? (
          <ul className="mt-1 text-muted">
            {state.skipped.map((s) => <li key={s.number}>Kept #{s.number} - {s.reason}.</li>)}
          </ul>
        ) : null}
      </div>
    );
  }

  if (!single && !count) return null; // nothing cancelled on the list
  const label = single ? `Delete order #${number}` : `Delete all ${count ?? ""} cancelled orders`.replace("  ", " ");
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={cx(button.ghost, "text-red", !single && "mb-3")}>
        <Trash2 className="h-4 w-4" /> {label}
      </button>
    );
  }
  return (
    <form action={action} className="kv-card mb-3 flex flex-wrap items-center gap-3 border-l-[3px] border-l-red px-4 py-3 text-sm">
      {single ? <><input type="hidden" name="orderId" value={orderId} /><input type="hidden" name="from" value="order" /></> : <input type="hidden" name="all" value="1" />}
      <span className="text-ink">
        {single ? `Delete order #${number} for good?` : `Delete all ${count} cancelled orders for good?`} This can&apos;t be undone. The customer profile stays.
      </span>
      <span className="flex gap-2">
        <button type="submit" disabled={pending} className={cx(button.primary, "bg-red hover:bg-red")}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Yes, delete
        </button>
        <button type="button" disabled={pending} onClick={() => setAsking(false)} className={button.ghost}>Keep</button>
      </span>
    </form>
  );
}
