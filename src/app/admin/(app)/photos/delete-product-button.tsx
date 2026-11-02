"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteProduct } from "../../photos-actions";
import { button, cx } from "../../ui";

/**
 * Owner request 2026-11-02: "i want the option to delete products" - a shirt added by mistake
 * (duplicate, wrong team, wrong supplier listing). Lives next to the other per-shirt actions in
 * Photos since that's the only admin page that already lists individual shirts by name with search -
 * the server action itself (deleteProduct) refuses a website shirt or one with order history and
 * says why, so a wrong click here can't silently break the site or an old order.
 */
export function DeleteProductButton({ productId, title, variant }: { productId: string; title: string; variant: "row" | "card" }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const triggerClass = variant === "row"
    ? cx(button.danger, "px-3")
    : cx(button.danger, "w-full justify-center px-2 py-1.5 text-xs");
  const iconClass = variant === "row" ? "h-4 w-4" : "h-3.5 w-3.5";

  async function onClick() {
    if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set("productId", productId);
    try {
      const res = await deleteProduct(fd);
      if (!res.ok) setErr(res.message);
      // success: the row disappears once the server component re-renders (revalidatePath in the action)
    } catch {
      setErr("Couldn't delete - try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={variant === "card" ? "mt-1.5" : undefined}>
      <button type="button" disabled={busy} onClick={onClick} className={triggerClass}>
        <Trash2 className={iconClass} /> Delete
      </button>
      {err ? <p className="mt-1 text-[11px] text-red">{err}</p> : null}
    </div>
  );
}
