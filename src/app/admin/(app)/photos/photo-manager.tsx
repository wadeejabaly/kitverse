"use client";

import { useEffect, useRef, useState } from "react";
/* eslint-disable @next/next/no-img-element */
import { Images, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import type { Sleeve } from "@/data/types";
import { deleteProductPhoto, listProductPhotos, setPrimaryPhoto, uploadProductPhoto } from "../../photos-actions";
import { button, cx, Badge } from "../../ui";
import { CropEditor, loadImage } from "./photo-upload-button";

type Photo = Awaited<ReturnType<typeof listProductPhotos>>[number];

/** One sleeve's gallery grid - a plain function declared outside PhotoManager so it isn't recreated (and
    doesn't reset any state) on every render; everything it needs comes in as props instead of closures. */
function Section({
  title, sleeve, items, emptyText, busyId, onAdd, onSetPrimary, onEdit, onDelete,
}: {
  title: string; sleeve: Sleeve; items: Photo[]; emptyText: string; busyId: string | null;
  onAdd: (sleeve: Sleeve) => void; onSetPrimary: (id: string) => void; onEdit: (url: string, sleeve: Sleeve) => void; onDelete: (id: string) => void;
}) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-medium tracking-wide text-muted uppercase">{title}</h4>
        <button type="button" onClick={() => onAdd(sleeve)} className={cx(button.ghost, "px-2 py-1 text-xs")}>
          <Plus className="h-3.5 w-3.5" /> Add photo
        </button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-2 py-6 text-center text-xs text-muted">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-xl border border-line-2 bg-paper">
              {/* object storage images, not next/image - this grid is admin-only and the set changes constantly */}
              <img src={p.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
              <div className="flex flex-wrap items-center gap-1 p-2">
                {p.isPrimary ? <Badge tone="green">Main photo</Badge> : null}
                {p.status === "bad" ? <Badge tone="red">Rejected</Badge> : null}
                {p.source === "owner" ? <Badge>Owner upload</Badge> : null}
              </div>
              <div className="flex flex-col gap-1.5 p-2 pt-0">
                <button
                  type="button"
                  disabled={p.isPrimary || busyId === p.id}
                  onClick={() => onSetPrimary(p.id)}
                  className={cx(button.ghost, "w-full justify-start px-2.5 py-1.5 text-xs")}
                >
                  <Star className="h-3.5 w-3.5" /> {p.isPrimary ? "Main photo" : "Set as main"}
                </button>
                <button type="button" disabled={busyId === p.id} onClick={() => onEdit(p.url, sleeve)} className={cx(button.ghost, "w-full justify-start px-2.5 py-1.5 text-xs")}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button type="button" disabled={busyId === p.id} onClick={() => onDelete(p.id)} className={cx(button.danger, "w-full justify-start px-2.5 py-1.5 text-xs")}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "Change a photo" used to only ever show the ONE picture currently live, with a single "Replace"
 * (upload a new file) action - no way to see, re-edit, or throw away whatever else was already
 * sitting in product_images for that shirt (owner report 2026-11-02: "i want the ability to remove
 * more than just the main picture i want to remove and edit all of them and choose the key picture").
 * This button opens that full set.
 *
 * It's actually TWO sets, not one (owner report 2026-11-02: "there are photos in the website that
 * dont appear in the admin") - the storefront gallery swaps its whole thumbnail row to a shirt's
 * long-sleeve photos once the shopper picks "Long sleeve" (ProductGallery.tsx), so this shows and
 * manages the short-sleeve and long-sleeve sets as two separate galleries, exactly like the site does.
 */
export function PhotoManagerButton({ productId, label, variant }: { productId: string; label: string; variant: "row" | "card" }) {
  const [open, setOpen] = useState(false);
  const triggerClass = variant === "row"
    ? "inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line-2 bg-surface px-3 py-2 text-sm hover:bg-raised"
    : "flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line-2 bg-surface px-2 py-1.5 text-xs hover:bg-raised";
  const iconClass = variant === "row" ? "h-4 w-4" : "h-3.5 w-3.5";

  return (
    <>
      <button type="button" className={triggerClass} onClick={() => setOpen(true)}>
        <Images className={iconClass} /> {label}
      </button>
      {open ? <PhotoManager productId={productId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PhotoManager({ productId, onClose }: { productId: string; onClose: () => void }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ img: HTMLImageElement; sleeve: Sleeve } | null>(null);
  const addSleeve = useRef<Sleeve>("short");
  const addInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      setPhotos(await listProductPhotos(productId));
    } catch {
      setError("Couldn't load this shirt's photos - try closing and reopening.");
    }
  }

  // Fetches on open rather than calling refresh() directly, so the effect's setState happens from its
  // own async callback (a stale response after the id changes mid-flight is simply dropped) and not
  // from a top-level function the linter can't see is already async-guarded.
  useEffect(() => {
    let cancelled = false;
    listProductPhotos(productId)
      .then((rows) => { if (!cancelled) setPhotos(rows); })
      .catch(() => { if (!cancelled) setError("Couldn't load this shirt's photos - try closing and reopening."); });
    return () => { cancelled = true; };
  }, [productId]);

  async function onSetPrimary(id: string) {
    setBusyId(id);
    setError(null);
    const fd = new FormData();
    fd.set("productId", productId);
    fd.set("imageId", id);
    try {
      await setPrimaryPhoto(fd);
      await refresh();
    } catch {
      setError("Couldn't set that as the main photo - try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Remove this photo? This can't be undone.")) return;
    setBusyId(id);
    setError(null);
    const fd = new FormData();
    fd.set("productId", productId);
    fd.set("imageId", id);
    try {
      await deleteProductPhoto(fd);
      await refresh();
    } catch {
      setError("Couldn't remove that photo - try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function onEdit(url: string, sleeve: Sleeve) {
    setError(null);
    try {
      setEditing({ img: await loadImage(url, { crossOrigin: true }), sleeve });
    } catch {
      setError("Couldn't load that photo to edit - try again.");
    }
  }

  function onAddClick(sleeve: Sleeve) {
    addSleeve.current = sleeve;
    addInputRef.current?.click();
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const sleeve = addSleeve.current;
    e.target.value = "";
    if (!file) return;
    setError(null);
    const url = URL.createObjectURL(file);
    try {
      setEditing({ img: await loadImage(url), sleeve });
    } catch {
      // A format this browser can't preview (e.g. HEIC off Apple devices) - upload as-is rather than block the owner.
      const fd = new FormData();
      fd.set("productId", productId);
      fd.set("sleeve", sleeve);
      fd.set("photo", file);
      try {
        await uploadProductPhoto(fd);
        await refresh();
      } catch {
        setError("Couldn't read or upload that photo - try a different file.");
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const shortPhotos = photos?.filter((p) => p.sleeve === "short") ?? [];
  const longPhotos = photos?.filter((p) => p.sleeve === "long") ?? [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink">All photos for this shirt</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {error ? <p className="mb-3 text-xs text-red">{error}</p> : null}
        <input ref={addInputRef} type="file" accept="image/*" className="sr-only" onChange={onFilePicked} />

        {photos === null ? (
          <p className="py-10 text-center text-sm text-muted">Loading...</p>
        ) : (
          <>
            {/* The site shows this set by default and whenever a shirt has no long-sleeve photos of
                its own (ProductGallery.tsx) - it's the one tied to primary_image_url and "Set as main". */}
            <Section
              title="Short sleeve" sleeve="short" items={shortPhotos} emptyText="No short-sleeve photos on file yet."
              busyId={busyId} onAdd={onAddClick} onSetPrimary={onSetPrimary} onEdit={onEdit} onDelete={onDelete}
            />
            {/* Shown even with nothing in it yet, since this is also how a shirt gets its FIRST
                long-sleeve photo - until one exists here, the site just keeps showing the short-sleeve
                set when "Long sleeve" is picked (every shirt's starting state). */}
            <Section
              title="Long sleeve" sleeve="long" items={longPhotos} emptyText="No long-sleeve photos yet - the site shows the short-sleeve photos instead until you add some."
              busyId={busyId} onAdd={onAddClick} onSetPrimary={onSetPrimary} onEdit={onEdit} onDelete={onDelete}
            />
          </>
        )}
      </div>

      {/* Editing an existing photo goes through the exact same crop/zoom/rotate editor as a fresh
          upload, and saving it the same way: it becomes a NEW photo in the list (the original stays,
          untouched, unless removed separately), in the SAME sleeve set it was edited from, and becomes
          that set's front photo - the same "a deliberate pick wins" rule setPrimaryPhoto follows
          (src/app/admin/photos-actions.ts). */}
      {editing ? (
        <CropEditor
          img={editing.img}
          productId={productId}
          sleeve={editing.sleeve}
          onClose={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}
