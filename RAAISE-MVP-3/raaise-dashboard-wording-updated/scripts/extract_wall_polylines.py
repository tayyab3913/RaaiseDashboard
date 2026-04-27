"""
Extract horizontal/vertical wall segments from a clean black-line layout
(public/layout_walls.png) and write them into the layout JSON.

The clean layout is line-art (black strokes on white). Every dark pixel is
treated as a wall. Coordinates are written as percentages [0..100] so they
align with pctToWorld() and remain consistent with layout_map.png (the
texture rendered on the floor) since both PNGs share the same aspect.

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
PNG = ROOT / "public" / "layout_walls.png"
LAYOUT = ROOT / "src" / "config" / "layouts" / "default-layout.json"
AUTO = ROOT / "src" / "config" / "layouts" / "wall-polylines-auto.json"


# Tuning ---------------------------------------------------------------------
TARGET_W = 0           # 0 = use native PNG resolution (no resize)
LUM_THRESHOLD = 140    # darker than this is wall ink
MIN_RUN_PCT = 1.0      # min run length per row/col, in % of axis
GAP_TOL_PCT = 2.5      # merge gaps within a band, in % of axis (bridges small breaks)
BAND_TOL_PCT = 0.7     # group rows/cols into a single wall band
MIN_FINAL_PCT = 3.0    # drop merged segments shorter than this, in %
MARGIN_PCT = 0.5       # skip pixels in the outer X% margin (image bleed)
DEDUP_DIST_PCT = 1.6   # merge parallel bands within this distance (% of secondary)
DEDUP_OVERLAP = 0.5    # ...and whose intervals overlap >= this fraction
# ----------------------------------------------------------------------------


def is_wall_pixel(r: int, g: int, b: int) -> bool:
    return (r + g + b) / 3 < LUM_THRESHOLD


def build_mask(im: Image.Image) -> list[list[int]]:
    w, h = im.size
    pix = im.load()
    return [
        [1 if is_wall_pixel(*pix[x, y][:3]) else 0 for x in range(w)]
        for y in range(h)
    ]


def edge_mask(mask: list[list[int]], w: int, h: int) -> list[list[int]]:
    """Keep only pixels on the boundary of black regions.

    Thin wall strokes (1-2 px) survive intact. Filled rectangles (desks,
    label boxes) collapse to their outline so they don't generate parallel
    scan-line walls through the interior.
    """
    out = [[0] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if not mask[y][x]:
                continue
            if (
                (x > 0 and not mask[y][x - 1])
                or (x < w - 1 and not mask[y][x + 1])
                or (y > 0 and not mask[y - 1][x])
                or (y < h - 1 and not mask[y + 1][x])
            ):
                out[y][x] = 1
    return out


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


def detect_axis_lines(
    mask: list[list[int]],
    w: int,
    h: int,
    horizontal: bool,
) -> list[tuple[float, int, int]]:
    """Return (band_pos_px, start_px, end_px) lines along the chosen axis."""
    primary = w if horizontal else h
    secondary = h if horizontal else w

    min_run = max(4, int(primary * MIN_RUN_PCT / 100))
    gap = max(2, int(primary * GAP_TOL_PCT / 100))
    band_tol = max(1, int(secondary * BAND_TOL_PCT / 100))
    min_final = max(4, int(primary * MIN_FINAL_PCT / 100))

    margin_secondary = int(secondary * MARGIN_PCT / 100)
    margin_primary = int(primary * MARGIN_PCT / 100)

    candidates: list[tuple[int, int, int]] = []
    for s in range(margin_secondary, secondary - margin_secondary):
        if horizontal:
            row = list(mask[s])
        else:
            row = [mask[r][s] for r in range(h)]
        for k in range(margin_primary):
            row[k] = 0
            row[primary - 1 - k] = 0
        for a, b in runs_in_row(row, min_run):
            candidates.append((s, a, b))

    candidates.sort()

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

    bands = merge_close_bands(bands, secondary, gap, min_final)

    out: list[tuple[float, int, int]] = []
    for pos, ints in bands:
        for s_, e_ in ints:
            out.append((pos, s_, e_))
    return out


def _interval_overlap(
    a: list[tuple[int, int]], b: list[tuple[int, int]]
) -> int:
    total = 0
    for sa, ea in a:
        for sb, eb in b:
            total += max(0, min(ea, eb) - max(sa, sb))
    return total


def _intervals_length(ints: list[tuple[int, int]]) -> int:
    return sum(e - s for s, e in ints) or 1


def merge_close_bands(
    bands: list[tuple[float, list[tuple[int, int]]]],
    secondary: int,
    gap: int,
    min_final: int,
) -> list[tuple[float, list[tuple[int, int]]]]:
    """Iteratively fuse parallel bands that are likely the two edges of one wall
    (or detection-broken fragments of one wall). Two bands fuse if their
    perpendicular distance is below DEDUP_DIST_PCT and one's intervals overlap
    >= DEDUP_OVERLAP of the shorter band.
    """
    dist = max(1, secondary * DEDUP_DIST_PCT / 100)
    bands = list(bands)
    changed = True
    while changed:
        changed = False
        n = len(bands)
        for j in range(n):
            for k in range(j + 1, n):
                pos_j, ints_j = bands[j]
                pos_k, ints_k = bands[k]
                if abs(pos_j - pos_k) > dist:
                    continue
                ov = _interval_overlap(ints_j, ints_k)
                shorter = min(_intervals_length(ints_j), _intervals_length(ints_k))
                if ov / shorter < DEDUP_OVERLAP:
                    continue
                w_j = _intervals_length(ints_j)
                w_k = _intervals_length(ints_k)
                new_pos = (pos_j * w_j + pos_k * w_k) / (w_j + w_k)
                merged = merge_intervals(list(ints_j) + list(ints_k), gap)
                merged = [(s, e) for s, e in merged if e - s + 1 >= min_final]
                if not merged:
                    bands.pop(k)
                    bands.pop(j)
                else:
                    bands[j] = (new_pos, merged)
                    bands.pop(k)
                changed = True
                break
            if changed:
                break
    return bands


def main() -> None:
    im0 = Image.open(PNG).convert("RGB")
    w0, h0 = im0.size
    if TARGET_W and w0 != TARGET_W:
        scale = TARGET_W / w0
        im = im0.resize(
            (TARGET_W, max(1, int(h0 * scale))), Image.Resampling.LANCZOS
        )
    else:
        im = im0
    w, h = im.size

    mask = edge_mask(build_mask(im), w, h)

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
