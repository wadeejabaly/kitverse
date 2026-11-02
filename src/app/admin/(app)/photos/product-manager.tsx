"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import { ImageOff, Trash2, Eye, EyeOff, Square, CheckSquare, Search as SearchIcon } from "lucide-react";
import { bulkDeleteProducts, bulkSetProductsHidden } from "../../photos-actions";
import { Badge, Card, EmptyState, button, cx } from "../../ui";

type Product = { id: string; title_en: string; title_ar: string | null; status: string; primary_image_url: string | null };

const STATUS_BADGE: Record<string, { label: string; tone: "green" | "neutral" | "red" }> = {
  featured: { label: "On website", tone: "green" },
  available: { label: "Bot only", tone: "neutral" },
  hidden: { label: "Hidden", tone: "red" },
  on_request: { label: "On request", tone: "neutral" },
};

/**
 * Owner request 2026-11-02: "i want to be able to delete in bulk and maybe turn the products on and
 * off in bulk too like the ones i dont want to show for now". Browses every shirt (any status), not
 * just ones with a photo problem - a bulk prune/hide pass needs to see the whole list, the same
 * search/category filter the other tabs use just narrows it down first.
 *
 * "Hide" sets status to "hidden" - already a real status the bot/checkout stack has always respected
 * (never shown by search_catalog, refused in a draft order, dropped from a web checkout line), this
 * is just the first place it can be set from the admin. "Show" sets it back to "available". A website
 * shirt ("On website" / status "featured") can't be hidden or deleted here - the website list lives in
 * catalog/store-selection.json, a code file, so this column doesn't control whether it's on the site;
 * the server action refuses it and says why rather than creating a silent mismatch.
 */
export function ProductManager({ products }: { products: Product[] }) {
  const [items, setItems] = useState(products);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const allSelected = items.length > 0 && selected.size === items.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((p) => p.id)));
  }

  const summary = useMemo(() => {
    return (label: string, done: string[], skipped: { id: string; title: string; reason: string }[]) => {
      const byReason = new Map<string, number>();
      for (const s of skipped) byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1);
      const skipText = [...byReason.entries()].map(([reason, n]) => `${n} (${reason})`).join(", ");
      return `${label} ${done.length}.${skipText ? ` Skipped ${skipText}.` : ""}`;
    };
  }, []);

  async function onDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} shirt${ids.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await bulkDeleteProducts(ids);
      setItems((prev) => prev.filter((p) => !res.deleted.includes(p.id)));
      setSelected(new Set());
      setNote(summary("Deleted", res.deleted, res.skipped));
    } catch {
      setNote("Couldn't delete - try again with a smaller selection.");
    } finally {
      setBusy(false);
    }
  }

  async function onSetHidden(hidden: boolean) {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await bulkSetProductsHidden(ids, hidden);
      setItems((prev) => prev.map((p) => (res.updated.includes(p.id) ? { ...p, status: hidden ? "hidden" : "available" } : p)));
      setSelected(new Set());
      setNote(summary(hidden ? "Hidden" : "Shown", res.updated, res.skipped));
    } catch {
      setNote("Couldn't update - try again with a smaller selection.");
    } finally {
      setBusy(false);
    }
  }

  if (!items.length) return <EmptyState icon={SearchIcon} title="No shirts match" text="Try a different name, category or status." />;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
        <button type="button" onClick={toggleAll} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink">
          {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          {selected.size ? `${selected.size} selected` : `Select all (${items.length})`}
        </button>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" disabled={!selected.size || busy} onClick={() => onSetHidden(false)} className={cx(button.ghost, "px-3 text-xs")}>
            <Eye className="h-3.5 w-3.5" /> Show
          </button>
          <button type="button" disabled={!selected.size || busy} onClick={() => onSetHidden(true)} className={cx(button.ghost, "px-3 text-xs")}>
            <EyeOff className="h-3.5 w-3.5" /> Hide
          </button>
          <button type="button" disabled={!selected.size || busy} onClick={onDelete} className={cx(button.danger, "px-3 text-xs")}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </div>
      {note ? <p className="mb-3 text-xs text-muted">{note}</p> : null}

      <Card padded={false} className="divide-y divide-line overflow-hidden">
        {items.map((p) => {
          const badge = STATUS_BADGE[p.status] ?? { label: p.status, tone: "neutral" as const };
          return (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-raised sm:px-5">
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 shrink-0 accent-pitch" />
              {p.primary_image_url ? (
                <img src={p.primary_image_url} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-paper text-muted"><ImageOff className="h-4 w-4" /></div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{p.title_en}</div>
              </div>
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </label>
          );
        })}
      </Card>
    </div>
  );
}
