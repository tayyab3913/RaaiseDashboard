"""
Segment the floorplan into individual enclosed rooms by rasterizing the
wall/perforated-wall/door geometry already in default-layout.json (doors are
included as blockers here — unlike pathfinding, room *segmentation* wants
each doorway treated as a boundary so a room doesn't bleed into its
corridor) and flood-filling the open floor area.

For each requested room code, resolves which connected region it falls in
(seeded from the existing "locations" entry) and reports that region's
precise bounding box + centroid, in plane percentage coordinates — ground
truth for repositioning room labels and for sizing/centering furniture.

Run:  python raaise-dashboard-wording-updated/scripts/find_rooms.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT   = Path(__file__).resolve().parents[1]
LAYOUT = ROOT / "src" / "config" / "layouts" / "default-layout.json"

# Raster resolution — downsampled from the 1690x713 reference image. Rooms
# span tens of percent so this is far more than enough precision, and keeps
# the pure-Python flood fill fast.
GRID_W = 845
GRID_H = 357
LINE_THICKNESS = 3  # grid cells — must be watertight enough to seal corners

# Two small gaps in the wall-extraction data (not real openings — confirmed
# by cross-referencing the adjoining wall segments, which stop just short of
# where they should meet). Real doorways are already correctly open via
# doors.polylines; these are patched here, for room-segmentation purposes
# only, so A08/A09 and the A10-row/A03-row don't leak into each other
# through the gap.
#   - h-007 (A08/A09 divider) starts at x=90.36 but the shared left wall
#     v-024 is at x=87.31 — the divider is missing its first ~3%.
#   - v-009 (A10's west wall) ends at y=60.87; h-017 (C05's north wall)
#     starts at x=55.44 — the corner between them doesn't quite close.
EXTRA_BLOCKING_SEGMENTS = [
    [[87.31, 24.75], [90.36, 24.75]],
    [[51.95, 60.87], [55.44, 61.85]],
    [[54.5, 70.27], [57.51, 70.27]],
]


def pct_to_grid(x: float, y: float) -> tuple[float, float]:
    return x / 100.0 * GRID_W, y / 100.0 * GRID_H


def draw_segment(blocked: np.ndarray, p0, p1, thickness: int) -> None:
    x0, y0 = pct_to_grid(*p0)
    x1, y1 = pct_to_grid(*p1)
    length = max(abs(x1 - x0), abs(y1 - y0), 1e-6)
    steps = int(length * 2) + 2
    for i in range(steps + 1):
        t = i / steps
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        xi, yi = int(round(x)), int(round(y))
        for dy in range(-thickness, thickness + 1):
            for dx in range(-thickness, thickness + 1):
                nx, ny = xi + dx, yi + dy
                if 0 <= nx < GRID_W and 0 <= ny < GRID_H:
                    blocked[ny, nx] = True


def rasterize_polylines(blocked: np.ndarray, polylines) -> None:
    for pl in polylines:
        pts = pl["points"]
        for i in range(len(pts) - 1):
            draw_segment(blocked, pts[i], pts[i + 1], LINE_THICKNESS)


def flood_fill_components(blocked: np.ndarray) -> np.ndarray:
    """Label each connected open (non-blocked) region with a unique id
    (0 = still a wall / unvisited-blocked). Returns an int array."""
    labels = np.zeros_like(blocked, dtype=np.int32)
    next_label = 1
    for y0 in range(GRID_H):
        for x0 in range(GRID_W):
            if blocked[y0, x0] or labels[y0, x0] != 0:
                continue
            stack = [(y0, x0)]
            labels[y0, x0] = next_label
            while stack:
                y, x = stack.pop()
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < GRID_H and 0 <= nx < GRID_W and not blocked[ny, nx] and labels[ny, nx] == 0:
                        labels[ny, nx] = next_label
                        stack.append((ny, nx))
            next_label += 1
    return labels


def main() -> None:
    layout = json.loads(LAYOUT.read_text(encoding="utf-8"))
    blocked = np.zeros((GRID_H, GRID_W), dtype=bool)

    rasterize_polylines(blocked, layout["walls"]["polylines"])
    rasterize_polylines(blocked, layout["perforatedWalls"]["polylines"])
    rasterize_polylines(blocked, layout["doors"]["polylines"])
    for p0, p1 in EXTRA_BLOCKING_SEGMENTS:
        draw_segment(blocked, p0, p1, LINE_THICKNESS)

    labels = flood_fill_components(blocked)
    n_components = labels.max()
    print(f"Grid {GRID_W}x{GRID_H}, blocked cells: {blocked.sum()}, components: {n_components}")

    # A00 has no sensor, so no "locations" entry to seed from — its current
    # label position is close enough visually to use as the seed.
    locations = {"A00": {"x": 4, "y": 47}, **layout["locations"]}

    # Which region does each known location code fall into? Search a small
    # spiral around the seed point if it lands exactly on a wall pixel.
    def region_at(pct_x: float, pct_y: float) -> int:
        gx, gy = pct_to_grid(pct_x, pct_y)
        gx, gy = int(round(gx)), int(round(gy))
        for r in range(0, 15):
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    if max(abs(dx), abs(dy)) != r:
                        continue
                    nx, ny = gx + dx, gy + dy
                    if 0 <= nx < GRID_W and 0 <= ny < GRID_H and labels[ny, nx] != 0:
                        return int(labels[ny, nx])
        return 0

    room_codes = [c for c in locations if c.startswith("A")]
    results = {}
    for code in sorted(room_codes):
        loc = locations[code]
        region_id = region_at(loc["x"], loc["y"])
        if region_id == 0:
            print(f"{code}: NO REGION FOUND (seed {loc})")
            continue
        ys, xs = np.nonzero(labels == region_id)
        x0, x1 = xs.min(), xs.max()
        y0, y1 = ys.min(), ys.max()
        cx, cy = xs.mean(), ys.mean()
        bbox_pct = [
            round(x0 / GRID_W * 100, 2), round(y0 / GRID_H * 100, 2),
            round(x1 / GRID_W * 100, 2), round(y1 / GRID_H * 100, 2),
        ]
        centroid_pct = [round(cx / GRID_W * 100, 2), round(cy / GRID_H * 100, 2)]
        area_pct = round((xs.size) / (GRID_W * GRID_H) * 100, 3)
        results[code] = {"region": region_id, "bbox": bbox_pct, "centroid": centroid_pct, "area_pct": area_pct}
        print(f"{code}: region={region_id:4d}  bbox={bbox_pct}  centroid={centroid_pct}  area%={area_pct}")

    out_path = ROOT / "scripts" / "room_bounds.json"
    out_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"Written -> {out_path}")


if __name__ == "__main__":
    main()
