"""Overlay current wall set (auto + manual) on layout_map.png for visual verification.

Reads polylines straight from default-layout.json so manual additions are included.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Install Pillow: pip install pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
PNG = ROOT / "public" / "layout_map.png"
LAYOUT = ROOT / "src" / "config" / "layouts" / "default-layout.json"
OUT = ROOT / "scripts" / "_walls_preview.png"


def main() -> None:
    im = Image.open(PNG).convert("RGB")
    w, h = im.size
    data = json.loads(LAYOUT.read_text(encoding="utf-8"))
    draw = ImageDraw.Draw(im)
    for poly in data["walls"]["polylines"]:
        manual = poly["id"].startswith("manual-")
        color = (30, 200, 60) if manual else (220, 30, 220)
        pts = [(int(x / 100 * w), int(y / 100 * h)) for x, y in poly["points"]]
        draw.line(pts, fill=color, width=4)
    im.save(OUT)
    print(f"Saved {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
