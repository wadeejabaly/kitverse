"use client";

import { useMemo, useRef, useState } from "react";
import { RotateCw, Upload, X, ZoomIn } from "lucide-react";
import { uploadProductPhoto } from "../../photos-actions";
import { button, cx } from "../../ui";

const VIEWPORT = 320; // the crop window, css px - matches the square thumbnails everywhere else

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = url;
  });
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
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    const url = URL.createObjectURL(file);
    try {
      setEditing(await loadImage(url));
    } catch {
      // A format this browser can't preview (e.g. HEIC off Apple devices) - upload as-is rather than block the owner.
      const fd = new FormData();
      fd.set("productId", productId);
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

  return (
    <>
      <label className={triggerClass}>
        <Upload className={iconClass} /> {label}
        <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={onPick} />
      </label>
      {err ? <p className="mt-1 text-xs text-red">{err}</p> : null}
      {editing ? <CropEditor img={editing} productId={productId} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function CropEditor({ img, productId, onClose }: { img: HTMLImageElement; productId: string; onClose: () => void }) {
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [zoom, setZoom] = useState(1); // 1 = fills the frame exactly, up to 3 = zoomed/cropped in tighter
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const work = useMemo(() => rotated(img, rotation), [img, rotation]);
  const workUrl = useMemo(() => work.canvas.toDataURL("image/jpeg", 0.85), [work]);
  const base = VIEWPORT / Math.min(work.w, work.h); // cover-fit scale at zoom = 1, never leaves empty edges
  const scale = base * zoom;
  const dispW = work.w * scale, dispH = work.h * scale;
  const minX = Math.min(0, VIEWPORT - dispW), minY = Math.min(0, VIEWPORT - dispH);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const posX = clamp(off.x, minX, 0), posY = clamp(off.y, minY, 0);

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
      const cropSize = VIEWPORT / scale; // back in work-canvas px
      ctx.drawImage(work.canvas, -posX / scale, -posY / scale, cropSize, cropSize, 0, 0, OUT, OUT);
      const blob = await new Promise<Blob>((resolve, reject) =>
        out.toBlob((b) => (b ? resolve(b) : reject(new Error("export failed"))), "image/jpeg", 0.92));
      const fd = new FormData();
      fd.set("productId", productId);
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
          <ZoomIn className="h-4 w-4 shrink-0 text-muted" />
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-[var(--pitch)]" aria-label="Zoom" />
          <button onClick={rotate} disabled={saving} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink" aria-label="Rotate 90 degrees">
            <RotateCw className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">Drag the photo to move it, slide to size it up or down.</p>
        {error ? <p className="mt-2 text-xs text-red">{error}</p> : null}
        <div className="mt-3 flex gap-2">
          <button onClick={onClose} disabled={saving} className={cx(button.ghost, "flex-1")}>Cancel</button>
          <button onClick={save} disabled={saving} className={cx(button.primary, "flex-1")}>{saving ? "Saving..." : "Use this photo"}</button>
        </div>
      </div>
    </div>
  );
}
