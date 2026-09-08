"""Generates the placeholder PNG icons: a blue rounded square with a white
selection marquee. Pure stdlib so the repo needs no image dependency."""
import zlib, struct, os

BG = (37, 99, 235, 255)     # --accent
FG = (255, 255, 255, 255)

def write_png(path, w, h, rows):
    raw = b"".join(b"\x00" + bytes(c for px in row for c in px) for row in rows)
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xffffffff)
    header = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
                + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))

def icon(n):
    radius = n * 0.22
    inset = max(1.0, n * 0.26)
    thick = max(1.0, n / 14.0)
    arm = n * 0.16
    rows = []
    for y in range(n):
        row = []
        for x in range(n):
            cx = min(max(x + 0.5, radius), n - radius)
            cy = min(max(y + 0.5, radius), n - radius)
            inside = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) <= radius ** 2
            if not inside:
                row.append((0, 0, 0, 0)); continue
            lo, hi = inset, n - inset
            near_v = (lo <= x < lo + thick) or (hi - thick <= x < hi)
            near_h = (lo <= y < lo + thick) or (hi - thick <= y < hi)
            in_x = lo <= x < hi
            in_y = lo <= y < hi
            corner_x = in_x and (x < lo + arm or x >= hi - arm)
            corner_y = in_y and (y < lo + arm or y >= hi - arm)
            mark = (near_h and corner_x) or (near_v and corner_y)
            row.append(FG if mark else BG)
        rows.append(row)
    return rows

out = os.path.join("src", "icons")
for size in (16, 32, 48, 128):
    write_png(os.path.join(out, "icon%d.png" % size), size, size, icon(size))
    print("icon%d.png" % size)
