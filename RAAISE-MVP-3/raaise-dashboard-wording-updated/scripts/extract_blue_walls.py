"""
Extract all architectural annotations from the layout reference image.

Input : public/layout_map - New.png
Output: src/config/layouts/default-layout.json

Four annotation colours are detected:
  BLUE   → solid walls            (walls.polylines)
  YELLOW → perforated walls       (perforatedWalls.polylines)
  GREEN  → door openings          (doors.polylines)
  PURPLE → coloured floor areas   (purpleGroundZones.zones)

Wall/door detection approach:
  1. Mask pixels of the target colour.
  2. HORIZONTAL walls: rows where the longest contiguous run >= MIN_RUN_PCT
     of image width. Group adjacent rows into bands; union runs → segments.
  3. VERTICAL walls: same with axes swapped.
  4. Emit polylines in plane percentages (0-100).

Ground zone detection:
  Column-projection → row-projection with a per-column density threshold
  that strips thin edge-noise, then finds each distinct filled region.

Coordinates: image (0,0) = top-left; output (0,0)..(100,100) maps the floor.

Run:  python raaise-dashboard-wording-updated/scripts/extract_blue_walls.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT    = Path(__file__).resolve().parents[1]
SRC_PNG = ROOT / "public" / "layout_map - New.png"
LAYOUT  = ROOT / "src" / "config" / "layouts" / "default-layout.json"

# ── Colour thresholds ─────────────────────────────────────────────────────────

# BLUE walls
BLUE_MINUS_RED   = 50
BLUE_MINUS_GREEN = 30
BLUE_MIN         = 150
BLUE_RED_MAX     = 150

# YELLOW perforated walls
YELLOW_R_MIN     = 180
YELLOW_G_MIN     = 160
YELLOW_B_MAX     = 100
YELLOW_R_MINUS_B = 100
YELLOW_G_MINUS_B = 80

# GREEN door openings
GREEN_G_MIN      = 140   # green channel must be strong
GREEN_G_MINUS_R  = 70    # green dominates red
GREEN_G_MINUS_B  = 50    # green dominates blue
GREEN_R_MAX      = 140
GREEN_B_MAX      = 150

# PURPLE ground zones (R and B both elevated, G suppressed)
PURPLE_R_MIN     = 120
PURPLE_B_MIN     = 80
PURPLE_R_MINUS_G = 55
PURPLE_B_MINUS_G = 30
PURPLE_RB_DIFF   = 100   # |R-B| small (not pure red or pure blue)

# ── Run / band detection tuning ───────────────────────────────────────────────
WALL_MIN_RUN_PCT  = 2.0   # % of image dimension — walls are long strokes
DOOR_MIN_RUN_PCT  = 0.4   # % — door segments are short
GAP_TOL_PX        = 3     # tolerate small dropouts inside one stroke
BAND_MERGE_PX     = 4     # adjacent qualifying rows/cols → same band
WALL_MIN_FINAL    = 1.5   # drop wall segments shorter than this % (noise)
DOOR_MIN_FINAL    = 0.3   # drop door segments shorter than this %

# ── Ground zone tuning ────────────────────────────────────────────────────────
ZONE_MIN_AREA_PCT   = 0.2   # % of image area; smaller blobs are noise
ZONE_COL_DENSITY    = 0.06  # fraction of image height — min pixels per column
ZONE_COL_GAP        = 2     # max gap (px) when merging column bands
ZONE_ROW_GAP_PCT    = 0.01  # max gap as fraction of image height


# ── Colour masks ──────────────────────────────────────────────────────────────

def blue_mask(img: np.ndarray) -> np.ndarray:
    r, g, b = img[..., 0].astype(int), img[..., 1].astype(int), img[..., 2].astype(int)
    return (b - r > BLUE_MINUS_RED) & (b - g > BLUE_MINUS_GREEN) & (b > BLUE_MIN) & (r < BLUE_RED_MAX)


def yellow_mask(img: np.ndarray) -> np.ndarray:
    r, g, b = img[..., 0].astype(int), img[..., 1].astype(int), img[..., 2].astype(int)
    return (r > YELLOW_R_MIN) & (g > YELLOW_G_MIN) & (b < YELLOW_B_MAX) & (r - b > YELLOW_R_MINUS_B) & (g - b > YELLOW_G_MINUS_B)


def green_mask(img: np.ndarray) -> np.ndarray:
    r, g, b = img[..., 0].astype(int), img[..., 1].astype(int), img[..., 2].astype(int)
    return (g > GREEN_G_MIN) & (g - r > GREEN_G_MINUS_R) & (g - b > GREEN_G_MINUS_B) & (r < GREEN_R_MAX) & (b < GREEN_B_MAX)


def purple_mask(img: np.ndarray) -> np.ndarray:
    r, g, b = img[..., 0].astype(int), img[..., 1].astype(int), img[..., 2].astype(int)
    return (r > PURPLE_R_MIN) & (b > PURPLE_B_MIN) & (r - g > PURPLE_R_MINUS_G) & (b - g > PURPLE_B_MINUS_G) & (np.abs(r - b) < PURPLE_RB_DIFF)


# ── Run helpers ───────────────────────────────────────────────────────────────

def find_runs(row: np.ndarray, gap_tol: int) -> list[tuple[int, int]]:
    """Return (start, end_inclusive) runs of True values, bridging small gaps."""
    runs: list[tuple[int, int]] = []
    in_run, start, last_true = False, 0, -1
    for x in range(row.size):
        if row[x]:
            if not in_run:
                in_run, start = True, x
            last_true = x
        elif in_run and (x - last_true) > gap_tol:
            runs.append((start, last_true))
            in_run = False
    if in_run:
        runs.append((start, last_true))
    return runs


def merge_intervals(ivs: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if not ivs:
        return []
    ivs = sorted(ivs)
    out: list[list[int]] = [list(ivs[0])]
    for s, e in ivs[1:]:
        if s <= out[-1][1] + 1:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return [(a, b) for a, b in out]


# ── Wall / line detection ─────────────────────────────────────────────────────

def detect_axis(mask: np.ndarray, axis: str, min_run_px: int) -> list[dict]:
    """Detect line strokes along one axis (h=horizontal, v=vertical)."""
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
            walls.append({"axis": axis, "center": center, "start": s, "end": e, "length": e - s + 1})
    return walls


def to_polylines(
    h_walls: list[dict], v_walls: list[dict],
    img_w: int, img_h: int,
    min_final_pct: float,
    prefix_h: str = "h", prefix_v: str = "v",
) -> list[dict]:
    polys: list[dict] = []
    min_h_len = min_final_pct / 100.0 * img_w
    min_v_len = min_final_pct / 100.0 * img_h

    for w in h_walls:
        if w["length"] < min_h_len:
            continue
        y_pct  = w["center"] / img_h * 100
        x0_pct = w["start"]  / img_w * 100
        x1_pct = w["end"]    / img_w * 100
        n = len([p for p in polys if p["id"].startswith(prefix_h)])
        polys.append({"id": f"{prefix_h}-{n:03d}",
                      "points": [[round(x0_pct, 2), round(y_pct, 2)],
                                 [round(x1_pct, 2), round(y_pct, 2)]]})

    for w in v_walls:
        if w["length"] < min_v_len:
            continue
        x_pct  = w["center"] / img_w * 100
        y0_pct = w["start"]  / img_h * 100
        y1_pct = w["end"]    / img_h * 100
        n = len([p for p in polys if p["id"].startswith(prefix_v)])
        polys.append({"id": f"{prefix_v}-{n:03d}",
                      "points": [[round(x_pct, 2), round(y0_pct, 2)],
                                 [round(x_pct, 2), round(y1_pct, 2)]]})
    return polys


# ── Ground zone detection ─────────────────────────────────────────────────────

def find_ground_zones(mask: np.ndarray, img_w: int, img_h: int) -> list[dict]:
    """Find bounding-box zones for each distinct filled annotated region.

    Uses density-filtered column projection so thin edge-noise (wall outlines
    bleeding a few pixels of colour) is ignored. No scipy required.
    """
    min_area_px    = (ZONE_MIN_AREA_PCT / 100.0) * img_w * img_h
    min_col_density = max(8, int(ZONE_COL_DENSITY * img_h))
    row_gap        = max(4, int(ZONE_ROW_GAP_PCT * img_h))

    zones: list[dict] = []

    col_counts = mask.sum(axis=0)
    col_has    = col_counts >= min_col_density
    col_runs   = find_runs(col_has, gap_tol=ZONE_COL_GAP)

    for c_start, c_end in col_runs:
        slab    = mask[:, c_start:c_end + 1]
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
    print(f"Image: {w_img}x{h_img}  ({SRC_PNG.name})")

    wall_run_h = max(6, int(WALL_MIN_RUN_PCT / 100.0 * w_img))
    wall_run_v = max(6, int(WALL_MIN_RUN_PCT / 100.0 * h_img))
    door_run_h = max(3, int(DOOR_MIN_RUN_PCT / 100.0 * w_img))
    door_run_v = max(3, int(DOOR_MIN_RUN_PCT / 100.0 * h_img))

    # ── Blue walls ────────────────────────────────────────────────────────────
    bm = blue_mask(img)
    blue_polys = to_polylines(
        detect_axis(bm, "h", wall_run_h),
        detect_axis(bm, "v", wall_run_v),
        w_img, h_img, WALL_MIN_FINAL, "h", "v",
    )

    # ── Yellow perforated walls ───────────────────────────────────────────────
    ym = yellow_mask(img)
    yellow_polys = to_polylines(
        detect_axis(ym, "h", wall_run_h),
        detect_axis(ym, "v", wall_run_v),
        w_img, h_img, WALL_MIN_FINAL, "rh", "rv",
    )

    # ── Green doors ───────────────────────────────────────────────────────────
    gm = green_mask(img)
    door_polys = to_polylines(
        detect_axis(gm, "h", door_run_h),
        detect_axis(gm, "v", door_run_v),
        w_img, h_img, DOOR_MIN_FINAL, "dh", "dv",
    )

    # ── Purple ground zones ───────────────────────────────────────────────────
    pm = purple_mask(img)
    ground_zones = find_ground_zones(pm, w_img, h_img)

    # ── Write JSON ────────────────────────────────────────────────────────────
    layout = json.loads(LAYOUT.read_text(encoding="utf-8"))

    layout["walls"]["polylines"] = blue_polys
    layout["walls"]["enabled"]   = True

    if "perforatedWalls" not in layout:
        layout["perforatedWalls"] = {
            "enabled": True, "height": 0.13, "thickness": 0.007,
            "color": "#b4b4ae", "holeRadius": 0.011, "holePitch": 0.026,
            "polylines": [],
        }
    layout["perforatedWalls"]["polylines"] = yellow_polys
    layout["perforatedWalls"]["enabled"]   = True

    if "doors" not in layout:
        layout["doors"] = {
            "enabled": True, "height": 0.13, "thickness": 0.007,
            "color": "#7c3aed", "holeRadius": 0.011, "holePitch": 0.026,
            "polylines": [],
        }
    layout["doors"]["polylines"] = door_polys
    layout["doors"]["enabled"]   = True

    if "purpleGroundZones" not in layout:
        layout["purpleGroundZones"] = {
            "enabled": True, "color": "#7c3aed", "opacity": 0.45, "zones": [],
        }
    layout["purpleGroundZones"]["zones"]   = ground_zones
    layout["purpleGroundZones"]["enabled"] = True

    LAYOUT.write_text(json.dumps(layout, indent=2), encoding="utf-8")

    print(
        f"Blue  walls  : {len(blue_polys)} polylines\n"
        f"Yellow walls : {len(yellow_polys)} polylines\n"
        f"Green doors  : {len(door_polys)} polylines\n"
        f"Ground zones : {len(ground_zones)}\n"
        f"Written -> {LAYOUT.name}"
    )


if __name__ == "__main__":
    main()
