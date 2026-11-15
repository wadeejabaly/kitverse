#!/usr/bin/env python3
"""
Full-kit product photos from a shirt photo + a shorts photo (owner request 2026-11-15, Real Madrid 2026/27
kits): writes three catalogue-standard 1200x1200 #F1F3F7 images -

  <out>.jpg         the kit: shirt on top, shorts under it at the matching scale (main photo)
  <out>-shirt.jpg   the shirt alone (second photo)
  <out>-shorts.jpg  the shorts alone (third photo)

Cut-outs use the same matte, de-fringe and soft shadow as standardize.py. Use the WHITE-background
originals (git history / catalog/showcase-sources), not the already-standardized #F1F3F7 photos, whose
baked-in shadow leaves a light outline.

Usage: python3 scripts/images/compose_kit.py SHIRT SHORTS OUT_PREFIX
  e.g. ... shirt.jpg shorts.webp public/products/real-madrid-2026-27-home-kit
Then add the three as product_images rows (short sleeve, sort 0/1/2) of the kit's product.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import standardize as st  # noqa: E402

C = st.CANVAS


def cutout(path: str):
    img = Image.open(path).convert("RGB")
    rgb = np.asarray(img)
    bg = st.border_colour(rgb)
    alpha, diag = st.foreground_mask(img, rgb, bg)
    fg = st.defringe(rgb, alpha, bg)
    ys, xs = np.where(alpha > 0.1)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    piece = Image.fromarray(np.dstack([fg[y0:y1, x0:x1], alpha[y0:y1, x0:x1] * 255]).astype(np.uint8), "RGBA")
    return piece, diag


def place(canvas: Image.Image, piece: Image.Image, left: int, top: int) -> None:
    sm = Image.new("L", canvas.size, 0)
    sm.paste(piece.split()[3], (left, top + st.SHADOW["offset"]))
    sm = sm.filter(ImageFilter.GaussianBlur(st.SHADOW["blur"])).point(lambda v: int(v * st.SHADOW["opacity"]))
    canvas.paste(Image.new("RGB", canvas.size, st.SHADOW["color"]), (0, 0), sm)
    canvas.paste(piece, (left, top), piece)


def save(canvas: Image.Image, path: str) -> None:
    canvas.save(path, "JPEG", quality=90, optimize=True, progressive=True)


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__)
        return 2
    shirt, shorts, out = sys.argv[1:]
    sp, sd = cutout(shirt)
    hp, hd = cutout(shorts)
    for name, d in (("shirt", sd), ("shorts", hd)):
        if d["ai_missed_share"] > 0.08 or d["touches_border"] or d["components"] > 1:
            print(f"check the {name} cut-out by eye: {d}")
    # kit: shirt 56% of the canvas height (width capped at 84%), shorts 66% of the shirt's width under it
    sh = int(C * 0.56)
    sw = round(sp.width * sh / sp.height)
    if sw > C * 0.84:
        sw = int(C * 0.84)
        sh = round(sp.height * sw / sp.width)
    s1 = sp.resize((sw, sh), Image.LANCZOS)
    hw = round(sw * 0.66)
    hh = round(hp.height * hw / hp.width)
    s2 = hp.resize((hw, hh), Image.LANCZOS)
    gap = int(C * 0.015)
    top = (C - (sh + gap + hh)) // 2
    can = Image.new("RGB", (C, C), st.BACKGROUND)
    place(can, s2, (C - hw) // 2, top + sh + gap)
    place(can, s1, (C - sw) // 2, top)
    save(can, f"{out}.jpg")
    for tag, p in (("shirt", sp), ("shorts", hp)):
        scale = min(st.HEIGHT_FRACTION * C / p.height, st.WIDTH_CAP * C / p.width)
        q = p.resize((round(p.width * scale), round(p.height * scale)), Image.LANCZOS)
        can = Image.new("RGB", (C, C), st.BACKGROUND)
        place(can, q, (C - q.width) // 2, (C - q.height) // 2)
        save(can, f"{out}-{tag}.jpg")
    print(f"wrote {out}.jpg, {out}-shirt.jpg, {out}-shorts.jpg")
    return 0


if __name__ == "__main__":
    sys.exit(main())
