"""
Extract wall polylines from the user's hand-traced blue layout image.

Input : public/layout_walls_blue.png  (the layout with blue freehand walls)
Output: src/config/layouts/default-layout.json (walls.polylines replaced)

Approach:
  1. Mask only the blue strokes (ignore everything else: greys, purples,
     room labels, the floor texture itself).
  2. Detect HORIZONTAL walls: rows in which the longest contiguous blue
     run is greater than MIN_RUN_PCT of the image width. Group adjacent
     such rows into bands; each band's runs are unioned to produce one
     or more horizontal segments at that band's centre y.
  3. Detect VERTICAL walls the same way, with axes swapped.
  4. Emit polylines in plane percentages.

Coordinates: image (0,0) = top-left; output (0,0)..(100,100) maps the
floor plane.

Run:  python raaise-dashboard-wording-updated/scripts/extract_blue_walls.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC_PNG = ROOT / "public" / "layout_walls_blue.png"
LAYOUT = ROOT / "src" / "config" / "layouts" / "default-layout.json"

# --- Tuning -----------------------------------------------------------------
# Blue-stroke colour thresholds (RGB). The traced strokes are saturated blue,
# so we want pixels where the blue channel clearly dominates.
BLUE_MINUS_RED = 50
BLUE_MINUS_GREEN = 30
BLUE_MIN = 150
RED_MAX = 150

# A "row contains a horizontal wall" if its longest run is at least this long.
MIN_RUN_PCT = 3.0   # % of image width (≈ 30px on 1024 wide)
GAP_TOL_PX = 3      # tolerate small dropouts inside a single hand-drawn stroke

# Bands that come within this many pixels of each other along the
# perpendicular axis are merged (handles wobble where one freehand wall
# spans 4–6 rows).
BAND_MERGE_PX = 4

# Drop trailing wall segments shorter than this (cosmetic; cleans flecks).
MIN_FINAL_PCT = 1.5
# ----------------------------------------------------------------------------


def blue_mask(img: np.ndarray) -> np.ndarray:
    r = img[..., 0].astype(int)
    g = img[..., 1].astype(int)
    b = img[..., 2].astype(int)
    return (
        (b - r > BLUE_MINUS_RED)
        & (b - g > BLUE_MINUS_GREEN)
        & (b > BLUE_MIN)
        & (r < RED_MAX)
    )


def find_runs(row: np.ndarray, gap_tol: int) -> list[tuple[int, int]]:
    """Return (start, end_inclusive) runs of True values, allowing small gaps."""
    runs: list[tuple[int, int]] = []
    in_run = False
    start = 0
    last_true = -1
    for x in range(row.size):
        if row[x]:
            if not in_run:
                in_run = True
                start = x
            last_true = x
        elif in_run and (x - last_true) > gap_tol:
            runs.append((start, last_true))
            in_run = False
    if in_run:
        runs.append((start, last_true))
    return runs


def merge_intervals(intervals: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if not intervals:
        return []
    intervals = sorted(intervals)
    out: list[list[int]] = [list(intervals[0])]
    for s, e in intervals[1:]:
        if s <= out[-1][1] + 1:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return [(a, b) for a, b in out]


def detect_axis(mask: np.ndarray, axis: str, min_run_px: int) -> list[dict]:
    """Detect walls along one axis.

    axis = 'h' detects horizontal walls (long runs in rows).
    axis = 'v' detects vertical walls   (long runs in columns).

    Returns list of {center, start, end, length} in pixel coords.
    """
    if axis == "h":
        scan = mask                  # iterate rows
        primary_axis = 0             # y is axis 0
    else:
        scan = mask.T                # iterate columns by transposing
        primary_axis = 1             # x is axis 1

    n_lines = scan.shape[0]
    line_runs: list[list[tuple[int, int]]] = []
    has_wall = np.zeros(n_lines, dtype=bool)

    for i in range(n_lines):
        runs = find_runs(scan[i], GAP_TOL_PX)
        line_runs.append(runs)
        has_wall[i] = any((e - s + 1) >= min_run_px for s, e in runs)

    # Group adjacent qualifying lines into bands.
    bands: list[list[int]] = []
    current: list[int] = []
    last_with_wall = -BAND_MERGE_PX - 1
    for i in range(n_lines):
        if has_wall[i]:
            if i - last_with_wall <= BAND_MERGE_PX and current:
                current.append(i)
            else:
                if current:
                    bands.append(current)
                current = [i]
            last_with_wall = i
    if current:
        bands.append(current)

    walls: list[dict] = []
    for band in bands:
        all_runs: list[tuple[int, int]] = []
        for i in band:
            for s, e in line_runs[i]:
                if (e - s + 1) >= min_run_px:
                    all_runs.append((s, e))
        merged = merge_intervals(all_runs)
        center = float(np.mean(band))
        for s, e in merged:
            walls.append({
                "axis": axis,
                "center": center,
                "start": s,
                "end": e,
                "length": e - s + 1,
            })

    return walls


def to_polylines(
    h_walls: list[dict], v_walls: list[dict], img_w: int, img_h: int
) -> list[dict]:
    polys: list[dict] = []
    min_h_len = MIN_FINAL_PCT / 100.0 * img_w
    min_v_len = MIN_FINAL_PCT / 100.0 * img_h

    for w in h_walls:
        if w["length"] < min_h_len:
            continue
        y_pct = w["center"] / img_h * 100
        x0_pct = w["start"] / img_w * 100
        x1_pct = w["end"] / img_w * 100
        polys.append({
            "id": f"h-{len([p for p in polys if p['id'].startswith('h-')]):03d}",
            "points": [[round(x0_pct, 2), round(y_pct, 2)],
                       [round(x1_pct, 2), round(y_pct, 2)]],
        })

    for w in v_walls:
        if w["length"] < min_v_len:
            continue
        x_pct = w["center"] / img_w * 100
        y0_pct = w["start"] / img_h * 100
        y1_pct = w["end"] / img_h * 100
        polys.append({
            "id": f"v-{len([p for p in polys if p['id'].startswith('v-')]):03d}",
            "points": [[round(x_pct, 2), round(y0_pct, 2)],
                       [round(x_pct, 2), round(y1_pct, 2)]],
        })

    return polys


def main() -> None:
    img = np.array(Image.open(SRC_PNG).convert("RGB"))
    h_img, w_img = img.shape[:2]
    mask = blue_mask(img)

    min_run_px_h = max(6, int(MIN_RUN_PCT / 100.0 * w_img))
    min_run_px_v = max(6, int(MIN_RUN_PCT / 100.0 * h_img))

    h_walls = detect_axis(mask, "h", min_run_px_h)
    v_walls = detect_axis(mask, "v", min_run_px_v)
    polylines = to_polylines(h_walls, v_walls, w_img, h_img)

    layout = json.loads(LAYOUT.read_text(encoding="utf-8"))
    layout["walls"]["polylines"] = polylines
    layout["walls"]["enabled"] = True
    LAYOUT.write_text(json.dumps(layout, indent=2), encoding="utf-8")

    print(f"Detected {len(h_walls)} horizontal + {len(v_walls)} vertical "
          f"raw walls; emitted {len(polylines)} polylines -> {LAYOUT.name}")


if __name__ == "__main__":
    main()
