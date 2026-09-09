#!/usr/bin/env python3
"""Renders the extension icons and the store logo.

    python tools/make-icons.py

Pure stdlib: no image dependency to install, and the icons stay reproducible
from source instead of being binaries nobody can regenerate.

The mark is a selection marquee with obscured content inside it — the two
things the extension actually does, in one silhouette.

Detail is reduced as the icon shrinks, which is the whole trick. A 3x3 mosaic
reads as pixelation at 128 px and as mud at 48 px, and at 16 px anything inside
the marquee just fills it in. So the small sizes drop content until only the
shape that still reads survives.
"""
import os
import struct
import zlib

OUT_DIR = os.path.join("src", "icons")
STORE_DIR = os.path.join("docs", "store-assets")

SIZES = (16, 32, 48, 128)
STORE_LOGO = 300

# A saturated blue holds up on both light and dark browser toolbars. A near
# black icon vanishes into a dark theme, a pale one into a light theme.
BG_TOP = (0x3B, 0x82, 0xF6)
BG_BOTTOM = (0x1D, 0x4E, 0xD8)
RADIUS = 0.225

# detail 0: marquee only          — 16 px
# detail 1: marquee + solid block — 32 and 48 px
# detail 2: marquee + 3x3 mosaic  — 128 px and the store logo
STYLES = (
    (16,  dict(inset=0.155, arm=0.235, thick=0.115, gap=0.000, detail=0)),
    (48,  dict(inset=0.165, arm=0.205, thick=0.090, gap=0.120, detail=1)),
    (999, dict(inset=0.175, arm=0.190, thick=0.076, gap=0.115, detail=2)),
)

MOSAIC = (
    (1.00, 0.55, 0.85),
    (0.60, 0.95, 0.50),
    (0.88, 0.68, 1.00),
)


def style_for(size):
    for limit, style in STYLES:
        if size <= limit:
            return style
    return STYLES[-1][1]


def in_rounded_square(u, v, radius):
    cx = min(max(u, radius), 1.0 - radius)
    cy = min(max(v, radius), 1.0 - radius)
    return (u - cx) ** 2 + (v - cy) ** 2 <= radius ** 2


def in_rect(u, v, x0, y0, x1, y1):
    return x0 <= u <= x1 and y0 <= v <= y1


def marquee_alpha(u, v, s):
    """Four corner brackets, drawn as eight rectangles."""
    lo, hi, t, arm = s["inset"], 1.0 - s["inset"], s["thick"], s["arm"]
    for y in (lo, hi - t):
        if in_rect(u, v, lo, y, lo + arm, y + t) or in_rect(u, v, hi - arm, y, hi, y + t):
            return 1.0
    for x in (lo, hi - t):
        if in_rect(u, v, x, lo, x + t, lo + arm) or in_rect(u, v, x, hi - arm, x + t, hi):
            return 1.0
    return 0.0


def content_alpha(u, v, s):
    if s["detail"] == 0:
        return 0.0

    lo = s["inset"] + s["gap"]
    hi = 1.0 - lo
    if not in_rect(u, v, lo, lo, hi, hi):
        return 0.0
    if s["detail"] == 1:
        return 0.92

    span = hi - lo
    gap = span * 0.085
    cell = (span - 2 * gap) / 3.0
    for row in range(3):
        for col in range(3):
            x0 = lo + col * (cell + gap)
            y0 = lo + row * (cell + gap)
            if in_rect(u, v, x0, y0, x0 + cell, y0 + cell):
                # Uneven opacity is what makes the grid read as pixelation.
                return MOSAIC[row][col]
    return 0.0


def shade(u, v, s):
    if not in_rounded_square(u, v, RADIUS):
        return (0, 0, 0, 0)

    t = (u + v) / 2.0
    bg = tuple(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t for i in range(3))

    alpha = marquee_alpha(u, v, s) or content_alpha(u, v, s)
    if alpha > 0.0:
        return tuple(bg[i] + (255 - bg[i]) * alpha for i in range(3)) + (255,)
    return bg + (255,)


def render(size, samples):
    """Supersamples every pixel and averages. The corner radius and the bracket
    ends are curved and diagonal edges that alias badly without it."""
    s = style_for(size)
    rows = []
    step = 1.0 / (size * samples)
    for py in range(size):
        row = []
        for px in range(size):
            r = g = b = a = 0.0
            for sy in range(samples):
                v = (py * samples + sy + 0.5) * step
                for sx in range(samples):
                    u = (px * samples + sx + 0.5) * step
                    cr, cg, cb, ca = shade(u, v, s)
                    # Premultiply, so transparent pixels drag no colour in.
                    w = ca / 255.0
                    r += cr * w
                    g += cg * w
                    b += cb * w
                    a += ca
            n = samples * samples
            a /= n
            if a > 0:
                scale = n * (a / 255.0)
                row.append((round(r / scale), round(g / scale), round(b / scale), round(a)))
            else:
                row.append((0, 0, 0, 0))
        rows.append(row)
    return rows


def write_png(path, rows):
    size = len(rows)
    raw = b"".join(b"\x00" + bytes(c for px in row for c in px) for row in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xffffffff)

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
                + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(STORE_DIR, exist_ok=True)

    for size in SIZES:
        samples = 4 if size >= 128 else 8
        path = os.path.join(OUT_DIR, "icon%d.png" % size)
        write_png(path, render(size, samples))
        print("%-32s %3d px, detalhe %d, %5d bytes"
              % (path, size, style_for(size)["detail"], os.path.getsize(path)))

    path = os.path.join(STORE_DIR, "logo-300.png")
    write_png(path, render(STORE_LOGO, 3))
    print("%-32s %3d px, logo da loja Edge, %5d bytes" % (path, STORE_LOGO, os.path.getsize(path)))


if __name__ == "__main__":
    main()
