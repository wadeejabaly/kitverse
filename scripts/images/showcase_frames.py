#!/usr/bin/env python3
"""
Frames for the homepage 360° jersey showcase (owner spec 2026-11-09,
"Interactive 360° jersey showcase").

One transparent cut-out per view, public/home/showcase/<jersey>/<view>.webp,
all normalised to the SAME 1456x1460 box: hem on row 1437, centred on x 722,
the height of the original hero composite's shirt
(public/home/hero-real-madrid.webp). That is what keeps scale and position
identical while rotating or switching jerseys; src/data/showcase.ts
(SHOWCASE_STAGE) stands that box on the podium of the hero film's last frame.

Cut-outs never redraw the shirt: background removal (the same AI matte +
colour flood as scripts/images/standardize.py), edge de-fringing and
resampling only. A shirt cut from a hero composite (source "composite") keeps
the composite's own lighting; a real product photo (source "photo") keeps
the photo's. Views that are too small or whose matte is doubtful are reported
so they can be re-shot rather than "fixed".

Usage:
  python3 scripts/images/showcase_frames.py --config scripts/images/showcase-sources.json
Each config entry: {"id": "...", "views": [{"name": "front", "file": "...", "source": "composite"|"photo"}]}
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
import standardize as std  # noqa: E402

HERO = "public/home/hero-real-madrid.webp"
OUT = "public/home/showcase"
PEDESTAL_Y = 1738  # first row of the pedestal top in the 1856x2304 hero
SHIRT_BOX = dict(cx=922, top=430, bottom=1737)  # the original Real Madrid shirt
CROP = (200, 300, 1656, 1760)  # frame canvas in hero coordinates (x0, y0, x1, y1)
MIN_SOURCE_HEIGHT = 700


def _session():
    from rembg import new_session

    return new_session("isnet-general-use")


def composite_mask(img: Image.Image, session) -> np.ndarray:
    """Soft alpha of the shirt standing in a hero composite (pedestal excluded)."""
    from rembg import remove

    ai = np.asarray(remove(img, session=session, only_mask=True, post_process_mask=False)).astype(np.float32) / 255
    solid = ai > 0.5
    lab, n = ndimage.label(solid)
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    keep = ndimage.binary_fill_holes(lab == (int(np.argmax(sizes)) + 1))
    keep[PEDESTAL_Y:] = False
    alpha = np.where(ndimage.binary_erosion(keep, iterations=2), 1.0, ai * ndimage.binary_dilation(keep, iterations=2))
    alpha[PEDESTAL_Y:] = 0
    return np.clip(alpha, 0, 1)


def photo_cutout(path: str) -> tuple[np.ndarray, np.ndarray, dict]:
    img = Image.open(path)
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        flat = Image.new("RGB", img.size, (255, 255, 255))
        flat.paste(img, mask=img.split()[3])
        img = flat
    img = img.convert("RGB")
    rgb = np.asarray(img)
    bg = std.border_colour(rgb)
    alpha, diag = std.foreground_mask(img, rgb, bg)
    # Pull the edge in by ~2px and soften it: the outermost ring of a photo
    # cut-out is where the old (usually white) background shows through as a
    # light outline on the dark stadium.
    import cv2

    inner = ndimage.binary_erosion(alpha > 0.5, iterations=2).astype(np.float32)
    alpha = np.minimum(alpha, cv2.GaussianBlur(inner, (0, 0), 1.0))
    fg = std.defringe(rgb, alpha, bg)
    return fg, alpha, diag


# Frames are composed on the 1456x1460 canvas above but delivered smaller:
# no screen shows one wider than ~1100 device pixels (a 3x phone), and the
# site places them by percentages, so the size changes nothing on the page.
DELIVER_WIDTH = 1100
DELIVER_QUALITY = 84


def deliver(frame: Image.Image) -> Image.Image:
    w, h = frame.size
    return frame.resize((DELIVER_WIDTH, round(h * DELIVER_WIDTH / w)), Image.LANCZOS)


def normalise(fg: np.ndarray, alpha: np.ndarray) -> Image.Image:
    ys, xs = np.nonzero(alpha > 0.1)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    piece = np.dstack([fg[y0:y1, x0:x1], alpha[y0:y1, x0:x1] * 255]).astype(np.uint8)
    ph, pw = piece.shape[:2]
    target_h = SHIRT_BOX["bottom"] - SHIRT_BOX["top"]
    cw, chh = CROP[2] - CROP[0], CROP[3] - CROP[1]
    scale = min(target_h / ph, (cw * 0.98) / pw)
    nw, nh = max(1, round(pw * scale)), max(1, round(ph * scale))
    resized = Image.fromarray(piece, "RGBA").resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (cw, chh), (0, 0, 0, 0))
    left = SHIRT_BOX["cx"] - CROP[0] - nw // 2
    top = SHIRT_BOX["bottom"] - CROP[1] - nh
    canvas.paste(resized, (left, top), resized)
    return canvas


def place_sequence(frames: list[Image.Image]) -> list[Image.Image]:
    """A turntable sequence (fixed camera): ONE transform for every frame, taken
    from the front frame, so the rotation axis and scale never wobble."""
    a0 = np.asarray(frames[0].split()[3]).astype(np.float32) / 255
    ys, xs = np.nonzero(a0 > 0.1)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    scale = (SHIRT_BOX["bottom"] - SHIRT_BOX["top"]) / (y1 - y0)
    cw, chh = CROP[2] - CROP[0], CROP[3] - CROP[1]
    left = round(SHIRT_BOX["cx"] - CROP[0] - ((x0 + x1) / 2) * scale)
    top = round(SHIRT_BOX["bottom"] - CROP[1] - y1 * scale)
    out = []
    for frame in frames:
        w, h = frame.size
        resized = frame.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        canvas = Image.new("RGBA", (cw, chh), (0, 0, 0, 0))
        canvas.paste(resized, (left, top), resized)
        out.append(canvas)
    return out


def build(config: str, session) -> list[dict]:
    report = []
    for jersey in json.load(open(config)):
        os.makedirs(f"{OUT}/{jersey['id']}", exist_ok=True)
        if "sequence" in jersey:
            # Already-transparent turntable frames (a render, or cut-outs of a
            # fixed-camera video), in rotation order.
            import glob

            files = sorted(glob.glob(jersey["sequence"]))
            for i, frame in enumerate(place_sequence([Image.open(f).convert("RGBA") for f in files])):
                dst = f"{OUT}/{jersey['id']}/{i:02d}.webp"
                deliver(frame).save(dst, "WEBP", quality=DELIVER_QUALITY, method=6)
                report.append({"jersey": jersey["id"], "view": i, "source": files[i], "output": dst, "flags": []})
            print(f"{jersey['id']:>32} {len(files)} sequence frames")
            continue
        for view in jersey["views"]:
            entry = {"jersey": jersey["id"], "view": view["name"], "source": view["file"], "flags": []}
            if view["source"] == "composite":
                img = Image.open(view["file"]).convert("RGB")
                alpha = composite_mask(img, session)
                fg = std.defringe(np.asarray(img), alpha, np.array([20, 30, 60]))
            else:
                fg, alpha, diag = photo_cutout(view["file"])
                entry["matte"] = diag
                if diag.get("ai_missed_share", 0) > 0.08:
                    entry["flags"].append("check_matte")
                if diag.get("touches_border"):
                    entry["flags"].append("shirt_touches_photo_edge")
                ys = np.nonzero((alpha > 0.1).any(1))[0]
                if len(ys) and ys.max() - ys.min() < MIN_SOURCE_HEIGHT:
                    entry["flags"].append("low_resolution_source")
            frame = normalise(fg, alpha)
            dst = f"{OUT}/{jersey['id']}/{view['name']}.webp"
            deliver(frame).save(dst, "WEBP", quality=DELIVER_QUALITY, method=6)
            entry["output"] = dst
            report.append(entry)
            print(f"{jersey['id']:>32} {view['name']:<6} {entry['flags']}")
    return report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config")
    ap.add_argument("--report")
    args = ap.parse_args()
    session = _session()
    if args.config:
        report = build(args.config, session)
        if args.report:
            json.dump(report, open(args.report, "w"), indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
