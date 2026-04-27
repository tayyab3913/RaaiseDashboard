"""
Extract horizontal/vertical wall segments from public/layout_map.png and write
src/config/layouts/wall-polylines-auto.json (and merge into default-layout.json).

Coordinates are percentages [0..100], matching pctToWorld() / locations in
default-layout.json. The PNG is treated as top-left origin (PIL convention).

Run:
  pip install pillow
  python raaise-dashboard-wording-updated/scripts/extract_wall_polylines.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Install Pillow: pip install pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
PNG = ROOT / "public" / "layout_map.png"
LAYOUT = ROOT / "src" / "config" / "layouts" / "default-layout.json"
AUTO = ROOT / "src" / "config" / "layouts" / "wall-polylines-auto.json"


# Tuning ---------------------------------------------------------------------
TARGET_W = 1400            # working resolution; bigger = sharper, slower
SAT_TOL = 30               # max(rgb)-min(rgb) allowed (skips purple labels)
LUM_LO, LUM_HI = 50, 195   # gray luminance range for wall strokes
MIN_RUN_PCT = 3.5          # min run length per row/col, in % of axis
GAP_TOL_PCT = 0.5          # merge gaps within a band, in % of axis
BAND_TOL_PCT = 1.5         # group rows/cols into a single wall band
MIN_FINAL_PCT = 4.5        # drop merged segments shorter than this, in %
MARGIN_PCT = 7.0           # skip pixels in the outer X% margin (border/text)
DE_STRIPE_PCT = 2.2        # drop band B if another band A within this distance
                           # has substantially overlapping intervals (hatching)
DE_STRIPE_OVERLAP = 0.7    # required X-overlap fraction to flag as a stripe
# ----------------------------------------------------------------------------


def is_wall_pixel(r: int, g: int, b: int) -> bool:
    if max(r, g, b) - min(r, g, b) > SAT_TOL:
        return False
    lum = (r + g + b) / 3
    return LUM_LO < lum < LUM_HI


def build_mask(im: Image.Image) -> tuple[list[list[int]], int, int]:
    w, h = im.size
    pix = im.load()
    mask = [[0] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b = pix[x, y]
            if is_wall_pixel(r, g, b):
                mask[y][x] = 1
    return mask, w, h


def runs_in_row(row: list[int], min_run: int) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    n = len(row)
    x = 0
    while x < n:
        if not row[x]:
            x += 1
            continue
        x0 = x
        while x < n and row[x]:
            x += 1
        if x - x0 >= min_run:
            out.append((x0, x - 1))
    return out


def merge_intervals(intervals: list[tuple[int, int]], gap: int) -> list[tuple[int, int]]:
    intervals = sorted(intervals)
    merged: list[list[int]] = []
    for s, e in intervals:
        if not merged or s > merged[-1][1] + gap:
            merged.append([s, e])
        else:
            merged[-1][1] = max(merged[-1][1], e)
    return [(s, e) for s, e in merged]


def thickness_filtered_row(mask: list[list[int]], y: int, h: int) -> list[int]:
    """Keep wall pixel only if it has a wall neighbor directly above or below.
    Suppresses 1-px-thin horizontal hatching while preserving real walls."""
    row = mask[y]
    above = mask[y - 1] if y > 0 else None
    below = mask[y + 1] if y + 1 < h else None
    out = [0] * len(row)
    for x, v in enumerate(row):
        if not v:
            continue
        if (above and above[x]) or (below and below[x]):
            out[x] = 1
    return out


def thickness_filtered_col(mask: list[list[int]], x: int, w: int, h: int) -> list[int]:
    """Same idea, perpendicular: keep pixel only if its left/right neighbor is also a wall."""
    out = [0] * h
    for y in range(h):
        if not mask[y][x]:
            continue
        left = mask[y][x - 1] if x > 0 else 0
        right = mask[y][x + 1] if x + 1 < w else 0
        if left or right:
            out[y] = 1
    return out


def detect_axis_lines(
    mask: list[list[int]],
    w: int,
    h: int,
    horizontal: bool,
) -> list[tuple[float, int, int]]:
    """Return (band_pos_px, start_px, end_px) lines along the chosen axis."""
    primary = w if horizontal else h
    secondary = h if horizontal else w

    min_run = max(8, int(primary * MIN_RUN_PCT / 100))
    gap = max(2, int(primary * GAP_TOL_PCT / 100))
    band_tol = max(2, int(secondary * BAND_TOL_PCT / 100))
    min_final = max(8, int(primary * MIN_FINAL_PCT / 100))

    margin_secondary = int(secondary * MARGIN_PCT / 100)
    margin_primary = int(primary * MARGIN_PCT / 100)

    candidates: list[tuple[int, int, int]] = []  # (band_pos_px, start, end)
    for s in range(margin_secondary, secondary - margin_secondary):
        if horizontal:
            row = thickness_filtered_row(mask, s, h)
        else:
            row = thickness_filtered_col(mask, s, w, h)
        for k in range(margin_primary):
            row[k] = 0
            row[primary - 1 - k] = 0
        for a, b in runs_in_row(row, min_run):
            candidates.append((s, a, b))

    candidates.sort()

    # Group neighboring rows/cols into a single wall band
    bands: list[tuple[float, list[tuple[int, int]]]] = []
    i = 0
    while i < len(candidates):
        seed = candidates[i][0]
        group: list[tuple[int, int, int]] = []
        while i < len(candidates) and candidates[i][0] - seed <= band_tol:
            group.append(candidates[i])
            i += 1
        intervals = [(c[1], c[2]) for c in group]
        merged = merge_intervals(intervals, gap)
        merged = [(s_, e_) for s_, e_ in merged if e_ - s_ + 1 >= min_final]
        if not merged:
            continue
        band_pos = sum(c[0] for c in group) / len(group)
        bands.append((band_pos, merged))

    # De-stripe: drop bands whose intervals are mostly covered by a nearby band
    de_stripe_dist = int(secondary * DE_STRIPE_PCT / 100)
    keep = [True] * len(bands)
    for j in range(len(bands)):
        if not keep[j]:
            continue
        pos_j, ints_j = bands[j]
        len_j = sum(e - s for s, e in ints_j) or 1
        for k in range(j + 1, len(bands)):
            pos_k, ints_k = bands[k]
            if abs(pos_k - pos_j) > de_stripe_dist:
                continue
            len_k = sum(e - s for s, e in ints_k) or 1
            overlap = 0
            for sj, ej in ints_j:
                for sk, ek in ints_k:
                    overlap += max(0, min(ej, ek) - max(sj, sk))
            shorter = min(len_j, len_k)
            if shorter and overlap / shorter >= DE_STRIPE_OVERLAP:
                # Keep the longer band; drop the shorter (most likely hatching)
                if len_j >= len_k:
                    keep[k] = False
                else:
                    keep[j] = False
                    break

    out: list[tuple[float, int, int]] = []
    for j, (pos, ints) in enumerate(bands):
        if not keep[j]:
            continue
        for s_, e_ in ints:
            out.append((pos, s_, e_))
    return out


def main() -> None:
    im0 = Image.open(PNG).convert("RGB")
    w0, h0 = im0.size
    if w0 > TARGET_W:
        scale = TARGET_W / w0
        im = im0.resize(
            (TARGET_W, max(1, int(h0 * scale))), Image.Resampling.LANCZOS
        )
    else:
        im = im0
    w, h = im.size

    mask, _, _ = build_mask(im)

    h_lines = detect_axis_lines(mask, w, h, horizontal=True)
    v_lines = detect_axis_lines(mask, w, h, horizontal=False)

    polylines = []
    for i, (y_px, xs, xe) in enumerate(h_lines):
        polylines.append(
            {
                "id": f"h-{i:03d}",
                "points": [
                    [round(100.0 * xs / w, 2), round(100.0 * y_px / h, 2)],
                    [round(100.0 * xe / w, 2), round(100.0 * y_px / h, 2)],
                ],
            }
        )
    for i, (x_px, ys, ye) in enumerate(v_lines):
        polylines.append(
            {
                "id": f"v-{i:03d}",
                "points": [
                    [round(100.0 * x_px / w, 2), round(100.0 * ys / h, 2)],
                    [round(100.0 * x_px / w, 2), round(100.0 * ye / h, 2)],
                ],
            }
        )

    AUTO.write_text(
        json.dumps(
            {
                "_generated": str(PNG),
                "_image_size": [w, h],
                "_segment_count": len(polylines),
                "polylines": polylines,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Wrote {len(polylines)} segments → {AUTO}", file=sys.stderr)

    if LAYOUT.exists():
        layout = json.loads(LAYOUT.read_text(encoding="utf-8"))
        layout["walls"]["polylines"] = polylines
        layout["walls"]["enabled"] = True
        LAYOUT.write_text(json.dumps(layout, indent=2), encoding="utf-8")
        print(f"Merged into {LAYOUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
