"""
Extract wall polylines from the user's hand-traced layout image.

Input : public/layout_walls_blue.png
Output: src/config/layouts/default-layout.json (walls, perforatedWalls,
        and purpleGroundZones sections replaced)

Three annotation types are detected:
  BLUE  → normal solid walls        (walls.polylines)
  RED   → slim perforated walls     (perforatedWalls.polylines)
  PURPLE→ coloured floor areas      (purpleGroundZones.zones as bounding boxes)

Approach for walls (blue / red):
  1. Mask pixels of the target colour channel.
  2. Detect HORIZONTAL walls: rows where the longest contiguous run ≥
     MIN_RUN_PCT of image width. Group adjacent rows into bands; union
     their runs into segments at the band centre y.
  3. Detect VERTICAL walls the same way (axes swapped).
  4. Emit polylines in plane percentages (0-100).

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

# --- Blue wall thresholds ---------------------------------------------------
BLUE_MINUS_RED   = 50
BLUE_MINUS_GREEN = 30
BLUE_MIN         = 150
BLUE_RED_MAX     = 150

# --- Red wall thresholds ----------------------------------------------------
RED_MINUS_GREEN  = 70   # red channel must dominate green
RED_MINUS_BLUE   = 55   # red channel must dominate blue
RED_MIN          = 150  # red channel brightness floor
RED_GREEN_MAX    = 120  # green must be subdued
RED_BLUE_MAX     = 130  # blue must be subdued

# --- Yellow area thresholds -------------------------------------------------
# Yellow = R and G both elevated, B suppressed.
YELLOW_R_MIN     = 180
YELLOW_G_MIN     = 160
YELLOW_B_MAX     = 100   # blue must be low
YELLOW_R_MINUS_B = 100   # R well above B
YELLOW_G_MINUS_B = 80    # G well above B

# --- Run / band detection tuning --------------------------------------------
MIN_RUN_PCT   = 3.0   # % of image width (≈30px on 1024-wide image)
GAP_TOL_PX    = 3     # tolerate small dropouts inside one hand-drawn stroke
BAND_MERGE_PX = 4     # adjacent qualifying rows within this many px → same band
MIN_FINAL_PCT = 1.5   # drop segments shorter than this (cleans up flecks)

# --- Ground zone tuning -----------------------------------------------------
PURPLE_MIN_AREA_PCT = 0.3   # % of image area; smaller blobs are noise
# ----------------------------------------------------------------------------


# ── Colour masks ─────────────────────────────────────────────────────────────

def blue_mask(img: np.ndarray) -> np.ndarray:
    r = img[..., 0].astype(int)
    g = img[..., 1].astype(int)
    b = img[..., 2].astype(int)
    return (
        (b - r > BLUE_MINUS_RED)
        & (b - g > BLUE_MINUS_GREEN)
        & (b > BLUE_MIN)
        & (r < BLUE_RED_MAX)
    )


def red_mask(img: np.ndarray) -> np.ndarray:
    r = img[..., 0].astype(int)
    g = img[..., 1].astype(int)
    b = img[..., 2].astype(int)
    return (
        (r - g > RED_MINUS_GREEN)
        & (r - b > RED_MINUS_BLUE)
        & (r > RED_MIN)
        & (g < RED_GREEN_MAX)
        & (b < RED_BLUE_MAX)
    )


def yellow_mask(img: np.ndarray) -> np.ndarray:
    """Detect the yellow annotation used to mark ground zones."""
    r = img[..., 0].astype(int)
    g = img[..., 1].astype(int)
    b = img[..., 2].astype(int)
    return (
        (r > YELLOW_R_MIN)
        & (g > YELLOW_G_MIN)
        & (b < YELLOW_B_MAX)
        & (r - b > YELLOW_R_MINUS_B)
        & (g - b > YELLOW_G_MINUS_B)
    )


# ── Run / wall detection (shared between blue and red) ───────────────────────

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

    axis='h': long runs across rows (horizontal walls).
    axis='v': long runs down columns (vertical walls).
    Returns list of {axis, center, start, end, length} in pixel coords.
    """
    scan = mask if axis == "h" else mask.T
    n_lines = scan.shape[0]
    line_runs: list[list[tuple[int, int]]] = []
    has_wall = np.zeros(n_lines, dtype=bool)

    for i in range(n_lines):
        runs = find_runs(scan[i], GAP_TOL_PX)
        line_runs.append(runs)
        has_wall[i] = any((e - s + 1) >= min_run_px for s, e in runs)

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


# ── Polyline conversion ───────────────────────────────────────────────────────

def to_polylines(
    h_walls: list[dict], v_walls: list[dict], img_w: int, img_h: int,
    prefix_h: str = "h", prefix_v: str = "v",
) -> list[dict]:
    polys: list[dict] = []
    min_h_len = MIN_FINAL_PCT / 100.0 * img_w
    min_v_len = MIN_FINAL_PCT / 100.0 * img_h

    for w in h_walls:
        if w["length"] < min_h_len:
            continue
        y_pct  = w["center"] / img_h * 100
        x0_pct = w["start"]  / img_w * 100
        x1_pct = w["end"]    / img_w * 100
        polys.append({
            "id": f"{prefix_h}-{len([p for p in polys if p['id'].startswith(prefix_h)]):03d}",
            "points": [[round(x0_pct, 2), round(y_pct, 2)],
                       [round(x1_pct, 2), round(y_pct, 2)]],
        })

    for w in v_walls:
        if w["length"] < min_v_len:
            continue
        x_pct  = w["center"] / img_w * 100
        y0_pct = w["start"]  / img_h * 100
        y1_pct = w["end"]    / img_h * 100
        polys.append({
            "id": f"{prefix_v}-{len([p for p in polys if p['id'].startswith(prefix_v)]):03d}",
            "points": [[round(x_pct, 2), round(y0_pct, 2)],
                       [round(x_pct, 2), round(y1_pct, 2)]],
        })

    return polys


# ── Purple zone detection ─────────────────────────────────────────────────────

def find_ground_zones(mask: np.ndarray, img_w: int, img_h: int) -> list[dict]:
    """Return bounding-box zones for each visually distinct annotated region.

    Uses pure-NumPy column-then-row projection so scipy is not required.
    Algorithm:
      1. Compute per-column pixel density; columns below MIN_COL_DENSITY are
         treated as empty. This strips edge noise from walls/room borders that
         bleed a few pixels of colour without being a true filled region.
      2. Find contiguous column bands in the density-filtered signal.
      3. Within each x-slab, project onto y-axis → find contiguous row bands.
      4. Each (x-slab × y-band) pair that clears the area threshold is one zone.
    """
    min_area_px = (PURPLE_MIN_AREA_PCT / 100.0) * img_w * img_h
    # A column must contain at least this many annotation pixels to count.
    # Sized at 8 % of image height so it rejects thin-strip noise (wall edges
    # that pick up a few coloured pixels) while keeping solid filled areas.
    min_col_density = max(10, int(0.08 * img_h))

    # Allow up to a 2-pixel gap when merging columns/rows inside one blob
    # (handles 1-px anti-aliasing dropouts inside a solid fill).
    col_gap = 2
    row_gap = max(4, int(0.01 * img_h))

    zones: list[dict] = []

    # Step 1 — density-filtered column projection.
    col_counts = mask.sum(axis=0)
    col_has = col_counts >= min_col_density
    col_runs = find_runs(col_has, gap_tol=col_gap)

    for c_start, c_end in col_runs:
        # Step 2 — within this x-slab, find contiguous row bands.
        slab = mask[:, c_start:c_end + 1]
        row_has = slab.any(axis=1)
        row_runs = find_runs(row_has, gap_tol=row_gap)

        for r_start, r_end in row_runs:
            region = mask[r_start:r_end + 1, c_start:c_end + 1]
            if region.sum() < min_area_px:
                continue
            zones.append({
                "id": f"pz-{len(zones):03d}",
                "bounds": [
                    [round(c_start / img_w * 100, 2), round(r_start / img_h * 100, 2)],
                    [round(c_end   / img_w * 100, 2), round(r_end   / img_h * 100, 2)],
                ],
            })

    return zones


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    img = np.array(Image.open(SRC_PNG).convert("RGB"))
    h_img, w_img = img.shape[:2]

    min_run_h = max(6, int(MIN_RUN_PCT / 100.0 * w_img))
    min_run_v = max(6, int(MIN_RUN_PCT / 100.0 * h_img))

    # ── Red (perforated) walls ───────────────────────────────────────────────
    r_mask = red_mask(img)
    rh = detect_axis(r_mask, "h", min_run_h)
    rv = detect_axis(r_mask, "v", min_run_v)
    red_polys = to_polylines(rh, rv, w_img, h_img, prefix_h="rh", prefix_v="rv")

    # ── Yellow (ground zone annotation) → rendered as purple floor ──────────
    p_mask = yellow_mask(img)
    purple_zones = find_ground_zones(p_mask, w_img, h_img)

    # ── Write to JSON ─────────────────────────────────────────────────────────
    layout = json.loads(LAYOUT.read_text(encoding="utf-8"))

    # NOTE: walls.polylines (blue) are NOT overwritten here so that any
    # manually-tuned or previously-extracted blue-wall data is preserved.
    # Re-run extract_blue_walls_only.py if you need to refresh blue walls.

    # Initialise perforatedWalls section if missing, then inject polylines.
    if "perforatedWalls" not in layout:
        layout["perforatedWalls"] = {
            "enabled": True,
            "height": 0.65,
            "thickness": 0.035,
            "color": "#c8b8a8",
            "holeRadius": 0.055,
            "holePitch": 0.13,
            "polylines": [],
        }
    layout["perforatedWalls"]["polylines"] = red_polys
    layout["perforatedWalls"]["enabled"] = True

    # Initialise purpleGroundZones section if missing, then inject zones.
    if "purpleGroundZones" not in layout:
        layout["purpleGroundZones"] = {
            "enabled": True,
            "color": "#7c3aed",
            "opacity": 0.45,
            "zones": [],
        }
    layout["purpleGroundZones"]["zones"] = purple_zones
    layout["purpleGroundZones"]["enabled"] = True

    LAYOUT.write_text(json.dumps(layout, indent=2), encoding="utf-8")

    print(
        f"Red   walls: {len(rh)}h + {len(rv)}v raw -> {len(red_polys)} polylines\n"
        f"Ground zones: {len(purple_zones)}\n"
        f"Written -> {LAYOUT.name}"
    )


if __name__ == "__main__":
    main()
