#!/usr/bin/env python3
"""
Re-lay out a full-kit photo from its own standardized pieces (owner request 2026-11-17: "the pants and
the shirts aren't the same proportions" across the 2026/27 kits).

Reads  <prefix>-shirt.jpg and <prefix>-shorts.jpg  (catalogue-standard 1200x1200 on flat #F1F3F7, as
written by compose_kit.py) and rewrites <prefix>.jpg with ONE rule for every kit:

  - the shorts' waistband is WAIST_TO_TORSO x the shirt's torso width (measured below the sleeves),
    so the shorts always sit in the same proportion to the body of the shirt, whatever the shape of
    the source photos;
  - shirt + small gap + shorts are scaled together to fill FILL_H of the canvas height (width capped
    at FILL_W) and centred.

The pieces are lifted off the flat background with a soft difference matte - the same background
colour on both sides, so nothing is redrawn and the soft shadows come along. compose_kit.py now uses
the same layout for new kits.

Usage: python3 scripts/images/relayout_kit.py public/products/real-madrid-2026-27-home-kit [...more prefixes]
"""
import sys

import numpy as np
from PIL import Image, ImageFilter

BG = np.array([0xF1, 0xF3, 0xF7], dtype=float)
C = 1200
WAIST_TO_TORSO = 0.92  # shorts waistband width / shirt torso width
FILL_H = 0.90
FILL_W = 0.80
GAP = 0.012  # of the canvas, between shirt hem and shorts waistband


def load(path):
    img = Image.open(path).convert("RGB")
    a = np.asarray(img).astype(float)
    diff = np.abs(a - BG).max(axis=2)
    return img, diff


def garment_box(diff, thr=9.0):
    """Bounding box of the garment (ignores the faint shadow and specks)."""
    m = diff > thr
    rows = np.where(m.sum(axis=1) > 6)[0]
    cols = np.where(m.sum(axis=0) > 6)[0]
    return cols.min(), rows.min(), cols.max() + 1, rows.max() + 1, m


def width_at(m, y):
    xs = np.where(m[y])[0]
    return (xs.max() - xs.min() + 1) if len(xs) else 0


def piece(path, measure_frac):
    img, diff = load(path)
    x0, y0, x1, y1, m = garment_box(diff)
    h = y1 - y0
    # widest run near the requested height (median of a small band, robust to logos/edges)
    band = [width_at(m, y0 + int(h * f)) for f in np.linspace(measure_frac - 0.03, measure_frac + 0.03, 7)]
    body = float(np.median([b for b in band if b > 0]))
    pad = 40  # keep the soft shadow
    box = (max(0, x0 - pad), max(0, y0 - pad), min(C, x1 + pad), min(C, y1 + pad))
    crop = img.crop(box)
    alpha = np.clip((diff[box[1]:box[3], box[0]:box[2]] - 2.0) / 10.0, 0, 1)
    a = Image.fromarray((alpha * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.6))
    rgba = crop.copy()
    rgba.putalpha(a)
    # garment bounds inside the crop (without the padding) for layout
    inner = (x0 - box[0], y0 - box[1], x1 - box[0], y1 - box[1])
    return rgba, inner, body


def relayout(prefix):
    shirt, sbox, torso = piece(f"{prefix}-shirt.jpg", 0.78)   # below the sleeves
    shorts, hbox, waist = piece(f"{prefix}-shorts.jpg", 0.06)  # the waistband
    s_h = sbox[3] - sbox[1]
    s_w = sbox[2] - sbox[0]
    k = WAIST_TO_TORSO * torso / waist  # shorts scale relative to the shirt
    h_h = (hbox[3] - hbox[1]) * k
    h_w = (hbox[2] - hbox[0]) * k
    total_h = s_h + GAP * C + h_h
    total_w = max(s_w, h_w)
    f = min(FILL_H * C / total_h, FILL_W * C / total_w)

    def scaled(img, inner, factor):
        im = img.resize((round(img.width * factor), round(img.height * factor)), Image.LANCZOS)
        return im, tuple(round(v * factor) for v in inner)

    s_img, s_in = scaled(shirt, sbox, f)
    h_img, h_in = scaled(shorts, hbox, f * k)
    top = round((C - (s_in[3] - s_in[1] + GAP * C + h_in[3] - h_in[1])) / 2)
    can = Image.new("RGB", (C, C), tuple(int(v) for v in BG))
    # shorts first, then the shirt over the gap (its hem shadow falls on the shorts like before)
    hx = round((C - (h_in[2] - h_in[0])) / 2) - h_in[0]
    hy = top + (s_in[3] - s_in[1]) + round(GAP * C) - h_in[1]
    can.paste(h_img, (hx, hy), h_img)
    sx = round((C - (s_in[2] - s_in[0])) / 2) - s_in[0]
    sy = top - s_in[1]
    can.paste(s_img, (sx, sy), s_img)
    can.save(f"{prefix}.jpg", "JPEG", quality=90, optimize=True, progressive=True)
    print(f"{prefix}: torso {torso:.0f}px waist {waist:.0f}px -> shorts x{k:.2f}, fill x{f:.2f}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    for p in sys.argv[1:]:
        relayout(p)
