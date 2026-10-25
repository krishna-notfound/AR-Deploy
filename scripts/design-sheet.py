#!/usr/bin/env python3
"""Pair design-review screenshots with their Stitch screens.

Reads <out>/manifest.json (written by scripts/design-review.mjs) and, for each entry that has a
Stitch screen, writes <out>/pairs/<key>-<width>.png: ours on the left, Stitch on the right, both
scaled to the same width (720 for desktop, 390 for mobile), with a label row, cropped to 3000px.

Usage: python scripts/design-sheet.py [--out design/review]
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

MAX_HEIGHT = 3000
LABEL_H = 40
GAP = 16
PAD = 12
BG = (250, 248, 243)
INK = (29, 28, 26)
MUTED = (90, 81, 72)
RULE = (217, 210, 198)


def load_font(size):
    for name in ("arial.ttf", "Arial.ttf", "DejaVuSans.ttf", "Helvetica.ttc"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def scaled(path, width):
    img = Image.open(path).convert("RGB")
    height = max(1, round(img.height * width / img.width))
    img = img.resize((width, height), Image.LANCZOS)
    return img.crop((0, 0, width, MAX_HEIGHT)) if height > MAX_HEIGHT else img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="design/review")
    args = ap.parse_args()
    out = Path(args.out)
    manifest_path = out / "manifest.json"
    if not manifest_path.exists():
        print(f"missing {manifest_path}: run scripts/design-review.mjs first", file=sys.stderr)
        return 1

    entries = json.loads(manifest_path.read_text(encoding="utf-8"))
    pairs = out / "pairs"
    pairs.mkdir(parents=True, exist_ok=True)
    font = load_font(15)
    written = skipped = 0

    for e in entries:
        if not e.get("stitch"):
            skipped += 1
            continue
        ours_path, stitch_path = Path(e["shot"]), Path(e["stitch"])
        if not ours_path.exists() or not stitch_path.exists():
            print(f"skip {e['key']}-{e['width']}: missing image", file=sys.stderr)
            skipped += 1
            continue
        col = 720 if e["width"] >= 1024 else 390
        ours, stitch = scaled(ours_path, col), scaled(stitch_path, col)
        body_h = max(ours.height, stitch.height)
        sheet = Image.new("RGB", (PAD * 2 + col * 2 + GAP, PAD * 2 + LABEL_H + body_h), BG)
        draw = ImageDraw.Draw(sheet)
        x_ours, x_stitch = PAD, PAD + col + GAP
        stitch_name = stitch_path.parent.name
        draw.text((x_ours, PAD + 10), f"ours  {e['key']} @{e['width']}", fill=INK, font=font)
        draw.text((x_stitch, PAD + 10), f"Stitch  {stitch_name}", fill=INK, font=font)
        top = PAD + LABEL_H
        draw.line([(PAD, top - 4), (sheet.width - PAD, top - 4)], fill=RULE)
        sheet.paste(ours, (x_ours, top))
        sheet.paste(stitch, (x_stitch, top))
        draw.rectangle([x_ours - 1, top - 1, x_ours + col, top + ours.height], outline=RULE)
        draw.rectangle([x_stitch - 1, top - 1, x_stitch + col, top + stitch.height], outline=RULE)
        sheet.save(pairs / f"{e['key']}-{e['width']}.png")
        written += 1

    print(f"{written} pair sheets in {pairs} ({skipped} entries without a Stitch screen)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
