#!/usr/bin/env python3
"""
Regenerate Drikr's app icons and splash from the brand mark's geometry.

Why this exists
---------------
The mark inside `assets/drikr-logo.png` is only **189x189 px** on the page, so
every icon derived from it by cropping and scaling up was a 5x enlargement: soft
edges on the concave curves, and visible stair-stepping on the four lobes at
launcher size.

The mark is not a photograph, though. It is four circular arcs and four rounded
corners, so it can be drawn exactly at any size instead of enlarged. This script
does that. The parameters below were fitted to the artwork by hill-climbing on
intersection-over-union against the 189 px original, reaching **IoU 0.981** with
1.4% of pixels differing — and those differences sit in the original's
anti-aliasing band, which is the most agreement a hard-edged model can have with
a soft-edged raster.

Construction: a square with rounded corners, minus four discs that bite into the
middle of each edge. The bite discs are very nearly tangent to the corner arcs,
which is what makes the lobes join the concave sides smoothly.

Usage
-----
    python assets/source/make-icons.py            # writes the four PNGs
    python assets/source/make-icons.py --check    # re-fits against the logo and
                                                  # reports IoU, writes nothing

Sizes are deliberately not changed without reason — see SIZES below. In
particular `adaptive-icon.png` keeps the mark at 0.432 of the canvas so that its
**diagonal** is 0.610, inside Android's 0.666 safe circle. Sizing an X-shaped
mark by its width instead of its diagonal is what clipped the lobes before: the
corners of the bounding box are what the circular mask cuts, and on this mark the
corners are exactly where the artwork is.
"""

from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.dirname(HERE)
LOGO = os.path.join(ASSETS, "drikr-logo.png")

# The mark's bounding box inside drikr-logo.png (1536x1024), measured.
LOGO_MARK_BOX = (198, 414, 387, 604)

# Fitted geometry, as fractions of the mark's full size.
RC = 0.1468       # rounded-corner radius
RB = 0.2768       # edge-bite disc radius
WAIST = 0.1825    # inset of the deepest point of each concave side

# Brand ink, sampled from the logo's core pixels.
INK = (13, 13, 14)

# Supersampling factor. 4x is past the point where more changes any pixel.
SS = 4

# (filename, canvas px, mark width as a fraction of the canvas, masked by Android)
#
# icon.png and splash.png fill the square: neither is masked, and the splash is
# further scaled down by the plugin's imageWidth anyway.
# adaptive-icon.png is masked by Android — see the note in the docstring.
# favicon.png is small enough that its own anti-aliasing dominates.
SIZES = [
    ("icon.png", 1024, 0.720, False),
    ("adaptive-icon.png", 1024, 0.432, True),
    ("splash.png", 1024, 0.720, False),
    ("favicon.png", 96, 0.720, False),
]


def mark_mask(size: int, span: float) -> np.ndarray:
    """Coverage of the mark in [0,1], on a `size` x `size` canvas."""
    n = size * SS
    s = span * n  # the mark's own size in supersampled pixels
    off = (n - s) / 2.0

    yy, xx = np.mgrid[0:n, 0:n]
    # Coordinates within the mark's own square.
    px = (xx + 0.5 - off).astype(np.float32)
    py = (yy + 0.5 - off).astype(np.float32)

    rc = RC * s
    rb = RB * s
    waist = WAIST * s

    cx = np.clip(px, rc, s - rc)
    cy = np.clip(py, rc, s - rc)
    inside = (px - cx) ** 2 + (py - cy) ** 2 <= rc * rc

    cb = waist - rb
    for bx, by in ((cb, s / 2), (s - cb, s / 2), (s / 2, cb), (s / 2, s - cb)):
        inside &= (px - bx) ** 2 + (py - by) ** 2 > rb * rb

    # Box-filter down: the average of SS x SS subpixels is the coverage.
    return inside.reshape(size, SS, size, SS).mean(axis=(1, 3))


def render(size: int, span: float) -> Image.Image:
    """Ink-coloured mark on a transparent ground."""
    cov = mark_mask(size, span)
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., 0] = INK[0]
    rgba[..., 1] = INK[1]
    rgba[..., 2] = INK[2]
    rgba[..., 3] = np.rint(cov * 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def load_target() -> np.ndarray:
    a = np.asarray(Image.open(LOGO).convert("L"))
    x0, y0, x1, y1 = LOGO_MARK_BOX
    return a[y0:y1, x0:x1] < 128


def check() -> int:
    """Re-fit against the original and report agreement. Writes nothing."""
    target = load_target()
    h, w = target.shape
    s = float(w)
    yy, xx = np.mgrid[0:h, 0:w]
    px = (xx + 0.5).astype(np.float32)
    py = ((yy + 0.5) * (s / h)).astype(np.float32)

    def iou(rc_f: float, rb_f: float, waist_f: float) -> float:
        rc, rb, waist = rc_f * s, rb_f * s, waist_f * s
        cx = np.clip(px, rc, s - rc)
        cy = np.clip(py, rc, s - rc)
        m = (px - cx) ** 2 + (py - cy) ** 2 <= rc * rc
        cb = waist - rb
        for bx, by in ((cb, s / 2), (s - cb, s / 2), (s / 2, cb), (s / 2, s - cb)):
            m &= (px - bx) ** 2 + (py - by) ** 2 > rb * rb
        return float((m & target).sum() / (m | target).sum())

    v = iou(RC, RB, WAIST)
    print(f"mark {w}x{h} in the logo")
    print(f"shipped parameters: rc={RC} rb={RB} waist={WAIST}")
    print(f"IoU against the original: {v:.5f}")
    for name, size, span, masked in SIZES:
        cov = mark_mask(size, span)
        ys, xs = np.where(cov > 0.5)
        bw = xs.max() - xs.min() + 1
        diag = (2 ** 0.5) * bw / size
        # Only the adaptive icon is cut by a mask. The others are square, so a
        # diagonal over 0.666 is correct there, not a problem.
        note = ""
        if masked:
            note = (
                "  <-- CLIPPED: outside Android's 0.666 safe circle"
                if diag > 0.666
                else "  (inside Android's 0.666 safe circle)"
            )
        print(f"  {name:20s} {size:4d}px  mark {bw/size:.3f} wide, diagonal {diag:.3f}{note}")
    return 0 if v > 0.97 else 1


def main() -> int:
    if "--check" in sys.argv:
        return check()
    for name, size, span, _masked in SIZES:
        img = render(size, span)
        out = os.path.join(ASSETS, name)
        img.save(out, optimize=True)
        print(f"wrote {out}  {size}x{size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
