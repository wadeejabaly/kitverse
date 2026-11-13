"use client";

import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";
import { saveTrackingNumber, type TrackingFormState } from "../../../../orders-actions";
import { button, input, cx } from "../../../../ui";

const INITIAL: TrackingFormState = { ok: true, message: "" };

/** The Junhe tracking number of a supplier batch (owner request 2026-11-13). */
export function TrackingNumberForm({ batchId, current }: { batchId: string; current: string | null }) {
  const [state, action, pending] = useActionState(saveTrackingNumber, INITIAL);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="batchId" value={batchId} />
      <label htmlFor="tracking-number" className="text-sm font-medium text-ink-2">Junhe tracking number</label>
      <div className="flex gap-2">
        <input id="tracking-number" name="trackingNumber" defaultValue={current ?? ""} placeholder="e.g. 97766951" autoComplete="off" spellCheck={false} dir="ltr" className={cx(input, "h-10 max-w-xs font-mono tabular-nums")} />
        <button type="submit" disabled={pending} className={cx(button.primary, "h-10")}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {current ? "Update" : "Save"}
        </button>
      </div>
      {state.message ? <p className={cx("text-sm", state.ok ? "text-green" : "text-red")} role="status">{state.message}</p> : null}
    </form>
  );
}
