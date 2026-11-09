#!/usr/bin/env python3
"""
Product photo standardizer (owner spec 2026-11-09, "Complete product image
standardization").

Turns any product photo into the catalogue standard WITHOUT touching the
shirt itself:

  * 1200 x 1200 square canvas, flat #F1F3F7 background;
  * the shirt cut out of its original background (white, grey, blue-grey,
    warm beige...) with an AI matte (rembg / ISNet), then interior holes
    filled so white collars, sleeves, logos and patterns inside the
    silhouette can never be erased;
  * edges de-fringed against the ORIGINAL background colour, so a shirt that
    was shot on white does not keep a white halo on the new grey;
  * the shirt's real bounding box scaled so its HEIGHT is 80% of the canvas
    (width capped at 86% for wide / long-sleeve shots) and centred on both
    axes — consistent visual scale, not just identical containers;
  * a faint, identical soft shadow under every shirt;
  * only resampling + (when upscaling a small source) a mild unsharp mask.
    No colour, exposure or generative changes: badges, sponsors, colours and
    fabric are the original pixels.

Every image gets QA flags; anything doubtful is reported for manual review
instead of being silently "fixed".

Usage:
  python3 scripts/images/standardize.py IN [IN ...] --out DIR [--report report.json]

Needs: pip install "rembg[cpu]" scipy pillow numpy (the ISNet model,
isnet-general-use.onnx, is cached in ~/.u2net on first use).
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

CANVAS = 1200
BACKGROUND = (0xF1, 0xF3, 0xF7)
HEIGHT_FRACTION = 0.80  # shirt height / canvas height
WIDTH_CAP = 0.86  # shirt width never exceeds this share of the canvas
SHADOW = dict(offset=16, blur=22, opacity=0.16, color=(14, 22, 48))
LOW_RES_PX = 700
UNSAFE_MISSED = 0.5  # AI matte missed more than half the garment -> manual  # a source shirt shorter than this is flagged as low-res
_session = None


def _rembg_session():
    global _session
    if _session is None:
        from rembg import new_session

        _session = new_session("isnet-general-use")
    return _session


def border_colour(rgb: np.ndarray) -> np.ndarray:
    strip = np.concatenate([rgb[:3].reshape(-1, 3), rgb[-3:].reshape(-1, 3), rgb[:, :3].reshape(-1, 3), rgb[:, -3:].reshape(-1, 3)])
    return np.median(strip, axis=0)


def background_tolerance(rgb: np.ndarray, bg: np.ndarray) -> tuple[float, bool]:
    """Colour tolerance for "this pixel is the old background", from the noise
    in the photo's border, and whether the background is uniform enough to
    trust a colour flood (studio shots: yes; lifestyle/gradient: no)."""
    sides = [rgb[:4].reshape(-1, 3), rgb[-4:].reshape(-1, 3), rgb[:, :4].reshape(-1, 3), rgb[:, -4:].reshape(-1, 3)]
    allb = np.concatenate(sides).astype(np.int16)
    dev = np.abs(allb - bg.astype(np.int16)).max(axis=1)
    p95 = float(np.percentile(dev, 95))
    side_spread = max(float(np.abs(np.median(s, axis=0) - bg).max()) for s in sides)
    uniform = p95 <= 20 and side_spread <= 12
    return float(np.clip(p95 + 4, 6, 24)), uniform


def foreground_mask(img: Image.Image, rgb: np.ndarray, bg: np.ndarray) -> tuple[np.ndarray, dict]:
    """Alpha matte 0..1 plus diagnostics.

    Two independent detectors are combined so neither can erase part of the
    shirt on its own:
      * the AI matte (ISNet), good at the outline but known to drop white
        areas (collars, crests, white stripes) on a white/grey background;
      * a colour flood from the photo border: everything the old background
        colour can reach from the edge is background, everything else is
        product. White shirt areas survive whenever the shirt has any seam,
        shadow or outline separating them from the background.
    The garment is the UNION of both (flood parts only where they touch the AI
    garment, so stray dust/specks are ignored), with interior holes filled."""
    from rembg import remove

    ai = np.asarray(remove(img, session=_rembg_session(), only_mask=True, post_process_mask=False)).astype(np.float32) / 255.0
    tol, uniform = background_tolerance(rgb, bg)

    solid = ai > 0.5
    labels, n = ndimage.label(solid)
    sizes = ndimage.sum(solid, labels, range(1, n + 1)) if n else np.array([])
    big = [i + 1 for i, s in enumerate(sizes) if s >= 0.15 * sizes.max()] if n else []
    ai_keep = np.isin(labels, big) if big else solid

    dist = np.abs(rgb.astype(np.int16) - bg.astype(np.int16)).max(axis=2)
    near_bg = dist <= tol
    lab_bg, _ = ndimage.label(near_bg)
    edge_ids = np.unique(np.concatenate([lab_bg[0], lab_bg[-1], lab_bg[:, 0], lab_bg[:, -1]]))
    flood_bg = np.isin(lab_bg, edge_ids[edge_ids > 0])
    flood_fg = ndimage.binary_opening(~flood_bg, iterations=1)

    if uniform:
        lab_fg, _ = ndimage.label(flood_fg)
        touching = np.unique(lab_fg[ai_keep & flood_fg])
        flood_keep = np.isin(lab_fg, touching[touching > 0])
        # Seal hairline gaps in the outline (a soft fold where a white shirt
        # meets a white background) before filling the inside.
        seal = max(2, round(min(rgb.shape[:2]) / 250))
        union = ndimage.binary_closing(ai_keep | flood_keep, iterations=seal, border_value=0)
        garment = ndimage.binary_fill_holes(union)
    else:
        flood_keep = np.zeros_like(ai_keep)
        garment = ndimage.binary_fill_holes(ai_keep)

    # Pull the edge in by one pixel: the outermost ring that the colour flood
    # stops at is a near-background blend and would show as a pale rim.
    garment = ndimage.binary_erosion(garment, iterations=1) | (ai_keep & garment & (ai > 0.9))
    # Soft edge: AI matte at the outline, solid inside, a 1px anti-alias.
    inner = ndimage.binary_erosion(garment, iterations=2)
    soft = ndimage.gaussian_filter(garment.astype(np.float32), 0.8)
    alpha = np.where(inner, 1.0, np.maximum(soft, ai * ndimage.binary_dilation(garment, iterations=2)))
    alpha = np.clip(np.where(garment | (alpha > 0.02), alpha, 0), 0, 1)

    # How much of the final garment the AI matte alone would have erased
    # (white areas on white) and how much the colour flood alone would miss.
    g = max(garment.sum(), 1)
    ai_missed = float((garment & ~ndimage.binary_dilation(ai_keep, iterations=2)).sum() / g)
    flood_missed = float((garment & flood_bg).sum() / g)

    glab, gn = ndimage.label(garment)
    gsizes = ndimage.sum(garment, glab, range(1, gn + 1)) if gn else np.array([])
    pieces = int((gsizes >= 0.15 * gsizes.max()).sum()) if gn else 0

    ys, xs = np.where(alpha > 0.5)
    h, w = alpha.shape
    touches = bool(len(xs)) and bool(xs.min() <= 1 or ys.min() <= 1 or xs.max() >= w - 2 or ys.max() >= h - 2)
    return alpha, {
        "components": pieces,
        "uniform_background": uniform,
        "tolerance": round(tol, 1),
        "ai_missed_share": round(ai_missed, 3),
        "colour_missed_share": round(flood_missed, 3),
        "touches_border": touches,
    }


def defringe(rgb: np.ndarray, alpha: np.ndarray, bg: np.ndarray) -> np.ndarray:
    """Recover the foreground colour of semi-transparent edge pixels:
    I = a*F + (1-a)*B  =>  F = (I - (1-a)*B) / a. Opaque pixels are untouched."""
    a = alpha[..., None]
    out = rgb.astype(np.float32)
    edge = (alpha > 0.02) & (alpha < 0.98)
    f = (out - (1 - a) * bg[None, None, :]) / np.maximum(a, 1e-3)
    out[edge] = np.clip(f[edge], 0, 255)
    return out


def standardize(path: str, out_path: str) -> dict:
    img = Image.open(path)
    img = img.convert("RGB")
    rgb = np.asarray(img)
    bg = border_colour(rgb)
    alpha, diag = foreground_mask(img, rgb, bg)
    if diag["ai_missed_share"] > UNSAFE_MISSED or (diag["ai_missed_share"] > 0.08 and diag["colour_missed_share"] > 0.25):
        # The AI matte lost most of the shirt, or both detectors are weak on
        # a large part of it (typically a white shirt on a near-white
        # background with no visible outline).
        # Any cut-out would be a guess, so nothing is written: the original
        # photo stays in use and the image goes to the manual-review list.
        return {
            "source": path,
            "status": "manual",
            "reason": "shirt edge not reliably visible against its background; original kept",
            "source_size": [rgb.shape[1], rgb.shape[0]],
            "old_background": [int(v) for v in bg],
            **diag,
        }
    fg = defringe(rgb, alpha, bg)

    ys, xs = np.where(alpha > 0.1)
    if not len(xs):
        return {"source": path, "status": "failed", "reason": "no garment found"}
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop_rgb = fg[y0:y1, x0:x1]
    crop_a = alpha[y0:y1, x0:x1]
    ch, cw = crop_a.shape
    scale = min(HEIGHT_FRACTION * CANVAS / ch, WIDTH_CAP * CANVAS / cw)
    nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))

    rgba = np.dstack([crop_rgb, crop_a * 255]).astype(np.uint8)
    piece = Image.fromarray(rgba, "RGBA").resize((nw, nh), Image.LANCZOS)
    if scale > 1.3:
        # Upscaled from a small source: restore some crispness. Luminance-only
        # unsharp mask via PIL — no colour change.
        r, g, b, a = piece.split()
        sharp = Image.merge("RGB", (r, g, b)).filter(ImageFilter.UnsharpMask(radius=1.6, percent=60, threshold=2))
        piece = Image.merge("RGBA", (*sharp.split(), a))

    canvas = Image.new("RGB", (CANVAS, CANVAS), BACKGROUND)
    left = (CANVAS - nw) // 2
    top = (CANVAS - nh) // 2

    # Soft shadow: the garment's own silhouette, offset down and blurred.
    shadow_mask = Image.new("L", (CANVAS, CANVAS), 0)
    shadow_mask.paste(piece.split()[3], (left, top + SHADOW["offset"]))
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(SHADOW["blur"]))
    shadow_mask = shadow_mask.point(lambda v: int(v * SHADOW["opacity"]))
    canvas.paste(Image.new("RGB", (CANVAS, CANVAS), SHADOW["color"]), (0, 0), shadow_mask)
    canvas.paste(piece, (left, top), piece)

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    if out_path.lower().endswith(".webp"):
        canvas.save(out_path, "WEBP", quality=90, method=6)
    else:
        canvas.save(out_path, "JPEG", quality=90, optimize=True, progressive=True)

    flags = []
    if ch < LOW_RES_PX:
        flags.append("low_resolution_source")
    if diag["touches_border"]:
        flags.append("garment_touches_photo_edge")
    if diag["components"] > 1:
        flags.append("multiple_garments_in_photo")
    if not diag["uniform_background"]:
        flags.append("non_uniform_background")
    # The detectors disagree a lot: the AI matte dropped a big part of the
    # shirt (rescued by the colour flood — check it), or the shirt is so close
    # to the background colour that the flood could not see a large part of it
    # (only the AI matte drew that edge — check it).
    if diag["ai_missed_share"] > 0.08:
        flags.append("ai_matte_missed_parts_rescued_by_colour")
    if diag["colour_missed_share"] > 0.25:
        flags.append("low_contrast_against_old_background")
    return {
        "source": path,
        "output": out_path,
        "status": "review" if flags else "ok",
        "flags": flags,
        "source_size": [rgb.shape[1], rgb.shape[0]],
        "garment_px": [int(cw), int(ch)],
        "scale": round(scale, 3),
        "old_background": [int(v) for v in bg],
        **diag,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+")
    ap.add_argument("--out", required=True, help="output directory")
    ap.add_argument("--report", help="write a JSON report here")
    ap.add_argument("--ext", default=".jpg")
    args = ap.parse_args()
    results = []
    for src in args.inputs:
        name = os.path.splitext(os.path.basename(src))[0] + args.ext
        try:
            res = standardize(src, os.path.join(args.out, name))
        except Exception as error:  # keep going; report the failure
            res = {"source": src, "status": "failed", "reason": repr(error)}
        results.append(res)
        print(f"{res['status']:7} {src} {res.get('flags', res.get('reason', ''))}", flush=True)
    if args.report:
        with open(args.report, "w") as fh:
            json.dump(results, fh, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
