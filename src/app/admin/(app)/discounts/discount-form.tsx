"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { createDiscountCode, deleteDiscountCode } from "../../discounts-actions";
import { button, input, cx } from "../../ui";

const field = "flex flex-col gap-1 text-xs text-muted";

/** The owner picks percent or fixed first, so the one amount field below asks for the right unit. */
export function DiscountForm() {
  const [kind, setKind] = useState<"percent" | "fixed">("percent");
  return (
    <form action={createDiscountCode} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className={field}>Code
        <input name="code" required maxLength={24} placeholder="SUMMER10" dir="ltr" className={cx(input, "uppercase tracking-wide")} />
      </label>
      <label className={field}>Type
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value === "fixed" ? "fixed" : "percent")} className={input}>
          <option value="percent">Percent off</option>
          <option value="fixed">Fixed amount off</option>
        </select>
      </label>
      <label className={field}>{kind === "percent" ? "Percent off (1-100)" : "Amount off (₪)"}
        <input name="value" required inputMode="decimal" dir="ltr" placeholder={kind === "percent" ? "10" : "20"} className={input} />
      </label>
      <label className={field}>Minimum order (₪, optional)
        <input name="minOrder" inputMode="decimal" dir="ltr" placeholder="0" className={input} />
      </label>
      <label className={field}>Max uses (optional)
        <input name="maxUses" inputMode="numeric" dir="ltr" placeholder="no limit" className={input} />
      </label>
      <label className={field}>Starts (optional)
        <input name="startsAt" type="datetime-local" className={input} />
      </label>
      <label className={field}>Ends (optional)
        <input name="endsAt" type="datetime-local" className={input} />
      </label>
      <label className="flex items-end gap-2 text-sm text-ink">
        <input type="checkbox" name="stackable" className="h-4 w-4 accent-[var(--pitch)]" />
        Can be combined with other codes
      </label>
      <div className="flex items-end">
        <button className={cx(button.primary, "w-full")}>Create code</button>
      </div>
    </form>
  );
}

/** A destructive action with no undo, so this is the one admin button here that asks first. */
export function DeleteCodeButton({ code }: { code: string }) {
  return (
    <form
      action={deleteDiscountCode}
      onSubmit={(e) => { if (!confirm(`Delete the code "${code}"? This can't be undone.`)) e.preventDefault(); }}
    >
      <input type="hidden" name="code" value={code} />
      <button className={cx(button.ghost, "text-red")} aria-label="Delete code"><Trash2 className="h-4 w-4" /></button>
    </form>
  );
}
