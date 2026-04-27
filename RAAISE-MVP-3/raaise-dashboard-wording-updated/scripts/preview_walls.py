"""Overlay extracted wall segments on layout_map.png for visual verification."""
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
AUTO = ROOT / "src" / "config" / "layouts" / "wall-polylines-auto.json"
OUT = ROOT / "scripts" / "_walls_preview.png"


def main() -> None:
    im = Image.open(PNG).convert("RGB")
    w, h = im.size
    data = json.loads(AUTO.read_text(encoding="utf-8"))
    draw = ImageDraw.Draw(im)
    for poly in data["polylines"]:
        pts = [(int(x / 100 * w), int(y / 100 * h)) for x, y in poly["points"]]
        draw.line(pts, fill=(220, 30, 220), width=4)
    im.save(OUT)
    print(f"Saved {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
