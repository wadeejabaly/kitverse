"use client";

import { useMemo, useRef, useState } from "react";
import { RotateCw, Upload, X, ZoomIn, ZoomOut } from "lucide-react";
import type { Sleeve } from "@/data/types";
import { uploadProductPhoto, uploadProductPhotos } from "../../photos-actions";
import { button, cx } from "../../ui";

const VIEWPORT = 320; // the crop window, css px - matches the square thumbnails everywhere else

/**
 * `crossOrigin` is needed to re-edit a photo that's already sitting on Supabase storage (an existing
 * URL, not a freshly picked File/blob URL) - without it, CropEditor's canvas reads back as "tainted"
 * and toBlob()/toDataURL() throw. A same-origin blob: URL (a fresh file pick) neither needs nor is
 * hurt by it.
 */
export function loadImage(url: string, opts?: { crossOrigin?: boolean }): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (opts?.crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = url;
  });
}

/** Phone photos can be 5+ MB each; shrink to the size the server keeps anyway (2048px JPEG) before
 *  sending, so a batch of several fits the upload limit. Falls back to the original file when the
 *  browser can't decode it (e.g. HEIC) - the server converts those itself. */
export async function shrinkForUpload(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Uploads several photos for one shirt in as few requests as fit the 16 MB server-action limit.
 *  Sent last-picked first, so the FIRST photo picked ends up as the front / main photo. */
export async function uploadMany(productId: string, sleeve: Sleeve, picked: File[], onProgress?: (done: number) => void) {
  const files = await Promise.all(picked.map(shrinkForUpload));
  const queue = [...files].reverse();
  let done = 0;
  while (queue.length) {
    const fd = new FormData();
    fd.set("productId", productId);
    fd.set("sleeve", sleeve);
    let size = 0;
    while (queue.length && (size === 0 || size + queue[0].size < 12 * 1024 * 1024)) {
      const f = queue.shift()!;
      size += f.size;
      fd.append("photos", f);
      done++;
    }
    await uploadProductPhotos(fd);
    onProgress?.(done);
  }
}

/** Bakes the chosen rotation into its own canvas once, so the pan/zoom math below never has to think about it. */
function rotated(img: HTMLImageElement, deg: 0 | 90 | 180 | 270) {
  const swap = deg === 90 || deg === 270;
  const w = swap ? img.naturalHeight : img.naturalWidth;
  const h = swap ? img.naturalWidth : img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(w / 2, h / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return { canvas, w, h };
}

/**
 * Picking a photo opens a crop/zoom/rotate editor before it ever uploads (owner request 2026-11-02:
 * "i dont want each time i need to change a picture or edit it to tell you") - drag to reposition,
 * slide to size the shot up or down, rotate a sideways supplier photo, then it uploads through the
 * same uploadProductPhoto action the plain upload always used, unchanged.
 */
export function PhotoUploadButton({ productId, label, variant }: { productId: string; label: string; variant: "row" | "card" }) {
  const [editing, setEditing] = useState<HTMLImageElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Owner report 2026-11-03: this quick Upload/Replace button always saved as the short-sleeve photo
  // with no way to say otherwise - the only place that could target long-sleeve was the full "All
  // photos" manager. Defaults to short (what this button always did before), but the owner can flip
  // it to long right here rather than having to go find a shirt in "All photos" just to add one.
  const [sleeve, setSleeve] = useState<Sleeve>("short");
  const inputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!picked.length) return;
    setErr(null);
    // Owner 2026-11-16: "it's not letting me upload more than a single picture at a time" - several
    // files go up together (first one picked = main photo); one file still opens the crop editor.
    if (picked.length > 1) {
      setBusy(`Uploading 0/${picked.length}...`);
      try {
        await uploadMany(productId, sleeve, picked, (n) => setBusy(`Uploading ${n}/${picked.length}...`));
      } catch {
        setErr("Couldn't upload one or more of those photos - try again.");
      } finally {
        setBusy(null);
      }
      return;
    }
    const file = picked[0];
    const url = URL.createObjectURL(file);
    try {
      setEditing(await loadImage(url));
    } catch {
      // A format this browser can't preview (e.g. HEIC off Apple devices) - upload as-is rather than block the owner.
      const fd = new FormData();
      fd.set("productId", productId);
      fd.set("sleeve", sleeve);
      fd.set("photo", file);
      try {
        await uploadProductPhoto(fd);
      } catch {
        setErr("Couldn't read or upload that photo - try a different file.");
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const triggerClass = variant === "row"
    ? "inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line-2 bg-surface px-3 py-2 text-sm hover:bg-raised"
    : "flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line-2 bg-surface px-2 py-1.5 text-xs hover:bg-raised";
  const iconClass = variant === "row" ? "h-4 w-4" : "h-3.5 w-3.5";
  const toggleBtn = (active: boolean) =>
    cx("flex-1 rounded-md px-2 py-1 text-[11px] font-medium", active ? "bg-pitch-fill text-white" : "text-muted hover:text-ink");

  const sleeveToggle = (
    <div className="inline-flex rounded-lg border border-line-2 bg-paper p-0.5" role="radiogroup" aria-label="Which sleeve length this photo is for">
      <button type="button" role="radio" aria-checked={sleeve === "short"} onClick={() => setSleeve("short")} className={toggleBtn(sleeve === "short")}>
        Short
      </button>
      <button type="button" role="radio" aria-checked={sleeve === "long"} onClick={() => setSleeve("long")} className={toggleBtn(sleeve === "long")}>
        Long
      </button>
    </div>
  );

  return (
    <>
      {variant === "row" ? (
        <div className="inline-flex items-center gap-2">
          {sleeveToggle}
          <label className={triggerClass}>
            <Upload className={iconClass} /> {label}
            <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" onChange={onPick} />
          </label>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {sleeveToggle}
          <label className={triggerClass}>
            <Upload className={iconClass} /> {label}
            <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" onChange={onPick} />
          </label>
        </div>
      )}
      {busy ? <p className="mt-1 text-xs text-muted">{busy}</p> : null}
      {err ? <p className="mt-1 text-xs text-red">{err}</p> : null}
      {editing ? <CropEditor img={editing} productId={productId} sleeve={sleeve} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

export function CropEditor({ img, productId, sleeve = "short", onClose }: { img: HTMLImageElement; productId: string; sleeve?: Sleeve; onClose: () => void }) {
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [zoom, setZoom] = useState(1); // 1 = fills the frame exactly, up to 3 = zoomed/cropped in tighter
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const work = useMemo(() => rotated(img, rotation), [img, rotation]);
  const workUrl = useMemo(() => work.canvas.toDataURL("image/jpeg", 0.85), [work]);
  const base = VIEWPORT / Math.min(work.w, work.h); // cover-fit scale at zoom = 1, never leaves empty edges
  // Owner request 2026-11-03: a zoom-OUT option, not just in - so the whole shirt can be shown instead
  // of always cropping to fill the square. Below zoom 1 the frame no longer fits edge-to-edge, so the
  // floor is the "contain" scale (the longer side exactly fits, the shorter side gets padding) - any
  // further out would just add more empty padding for no benefit.
  const minZoom = Math.min(work.w, work.h) / Math.max(work.w, work.h);
  const scale = base * zoom;
  const dispW = work.w * scale, dispH = work.h * scale;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  // Covering an axis (disp >= frame): drag within the usual negative range. Smaller than the frame
  // (zoomed out past cover on that axis): center it instead of pinning it to the top-left corner.
  const posX = dispW >= VIEWPORT ? clamp(off.x, VIEWPORT - dispW, 0) : (VIEWPORT - dispW) / 2;
  const posY = dispH >= VIEWPORT ? clamp(off.y, VIEWPORT - dispH, 0) : (VIEWPORT - dispH) / 2;
  const minX = Math.min(0, VIEWPORT - dispW), minY = Math.min(0, VIEWPORT - dispH);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: posX, oy: posY };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setOff({
      x: clamp(drag.current.ox + (e.clientX - drag.current.x), minX, 0),
      y: clamp(drag.current.oy + (e.clientY - drag.current.y), minY, 0),
    });
  }
  function rotate() {
    setRotation(((rotation + 90) % 360) as 0 | 90 | 180 | 270);
    setZoom(1);
    setOff({ x: 0, y: 0 });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const OUT = 1400;
      const out = document.createElement("canvas");
      out.width = OUT;
      out.height = OUT;
      const ctx = out.getContext("2d")!;
      // Zoomed out past cover-fit, the crop window is bigger than the photo on at least one side -
      // fill white first so that padding comes out white, not JPEG's default black for empty pixels.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, OUT, OUT);
      const cropSize = VIEWPORT / scale; // back in work-canvas px
      ctx.drawImage(work.canvas, -posX / scale, -posY / scale, cropSize, cropSize, 0, 0, OUT, OUT);
      const blob = await new Promise<Blob>((resolve, reject) =>
        out.toBlob((b) => (b ? resolve(b) : reject(new Error("export failed"))), "image/jpeg", 0.92));
      const fd = new FormData();
      fd.set("productId", productId);
      fd.set("sleeve", sleeve);
      fd.set("photo", new File([blob], "photo.jpg", { type: "image/jpeg" }));
      await uploadProductPhoto(fd);
      onClose();
    } catch (e) {
      setError((e as Error).message || "Upload failed - try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" onClick={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="w-full max-w-sm rounded-2xl bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink">Fit the photo</h3>
          <button onClick={onClose} disabled={saving} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          className="relative mx-auto touch-none overflow-hidden rounded-xl bg-paper"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={workUrl} alt="" draggable={false}
            className="pointer-events-none absolute left-0 top-0 select-none"
            style={{ width: dispW, height: dispH, transform: `translate(${posX}px, ${posY}px)` }} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={() => setZoom((z) => Math.max(minZoom, Number((z - 0.1).toFixed(2))))} disabled={saving}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink" aria-label="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </button>
          <input type="range" min={minZoom} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-[var(--pitch)]" aria-label="Zoom" />
          <button type="button" onClick={() => setZoom((z) => Math.min(3, Number((z + 0.1).toFixed(2))))} disabled={saving}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink" aria-label="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button onClick={rotate} disabled={saving} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink" aria-label="Rotate 90 degrees">
            <RotateCw className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">Drag the photo to move it, slide (or tap +/-) to zoom in or out - zoom out past the edges to fit the whole shirt.</p>
        {error ? <p className="mt-2 text-xs text-red">{error}</p> : null}
        <div className="mt-3 flex gap-2">
          <button onClick={onClose} disabled={saving} className={cx(button.ghost, "flex-1")}>Cancel</button>
          <button onClick={save} disabled={saving} className={cx(button.primary, "flex-1")}>{saving ? "Saving..." : "Use this photo"}</button>
        </div>
      </div>
    </div>
  );
}
