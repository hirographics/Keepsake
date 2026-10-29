"""Builds the Procreate art templates for Keepsake scrap packs.

Each template is a layered PSD (Procreate opens these with layers intact):
  - "GUIDES - hide before export": dashed safe lines, repeat edges, short instructions
  - "ART - draw here": empty, transparent
  - optional base color layer
A matching guide-only PNG is also written as a fallback.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer
from psd_tools.constants import Compression
RLE = Compression.RLE

OUT = sys.argv[1] if len(sys.argv) > 1 else "templates"
os.makedirs(OUT, exist_ok=True)

FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

CYAN = (0, 170, 220, 255)
MAGENTA = (230, 40, 140, 255)
GRAY = (60, 60, 60, 255)


def font(size, bold=False):
    try:
        return ImageFont.truetype(FONT_B if bold else FONT_R, size)
    except OSError:
        return ImageFont.load_default()


def dashed_line(d, a, b, color, width=4, dash=28, gap=18):
    (x1, y1), (x2, y2) = a, b
    length = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
    if length == 0:
        return
    dx, dy = (x2 - x1) / length, (y2 - y1) / length
    pos = 0.0
    while pos < length:
        end = min(pos + dash, length)
        d.line([(x1 + dx * pos, y1 + dy * pos), (x1 + dx * end, y1 + dy * end)], fill=color, width=width)
        pos += dash + gap


def dashed_rect(d, box, color, width=4):
    x1, y1, x2, y2 = box
    dashed_line(d, (x1, y1), (x2, y1), color, width)
    dashed_line(d, (x2, y1), (x2, y2), color, width)
    dashed_line(d, (x2, y2), (x1, y2), color, width)
    dashed_line(d, (x1, y2), (x1, y1), color, width)


def text_block(d, xy, lines, size, color=GRAY, gap=1.35, bold_first=True):
    x, y = xy
    for i, line in enumerate(lines):
        f = font(int(size * (1.25 if (i == 0 and bold_first) else 1)), bold=(i == 0 and bold_first))
        d.text((x, y), line, font=f, fill=color)
        y += int(size * gap * (1.25 if (i == 0 and bold_first) else 1))


def save(name, size, guide, base_color=None):
    w, h = size
    psd = PSDImage.new("RGBA", (w, h), color=(0, 0, 0, 0))
    if base_color:
        psd.append(PixelLayer.frompil(Image.new("RGBA", (w, h), base_color), psd, "BASE color - optional", compression=RLE))
    psd.append(PixelLayer.frompil(Image.new("RGBA", (w, h), (0, 0, 0, 0)), psd, "ART - draw here", compression=RLE))
    psd.append(PixelLayer.frompil(guide, psd, "GUIDES - hide before export", compression=RLE))
    # Write a compressed merged preview so the file stays small
    merged = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    if base_color:
        merged = Image.alpha_composite(merged, Image.new("RGBA", (w, h), base_color))
    merged = Image.alpha_composite(merged, guide)
    rec = psd._record
    rec.image_data.compression = RLE
    rec.image_data.set_data([c.tobytes() for c in merged.split()], rec.header)
    psd.save(os.path.join(OUT, name + ".psd"))
    guide.save(os.path.join(OUT, name + "-guides.png"))
    print("wrote", name, w, h)


# 1. Page pattern tile: 2048 x 2048, repeats on all four sides
def pattern():
    w = h = 2048
    m = 96  # safe margin for easy mode
    g = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    d.rectangle([0, 0, w - 1, h - 1], outline=MAGENTA, width=6)  # repeat edge
    dashed_rect(d, (m, m, w - m, h - m), CYAN, 5)  # easy-mode safe line
    dashed_line(d, (w // 2, 0), (w // 2, h), (*CYAN[:3], 110), 3)  # half lines for advanced mode
    dashed_line(d, (0, h // 2), (w, h // 2), (*CYAN[:3], 110), 3)
    text_block(d, (m + 40, m + 40), [
        "PAGE PATTERN  2048 x 2048",
        "Repeats on all four sides.",
        "",
        "EASY: keep all art inside the blue dashed line.",
        "The tile then repeats with no seams.",
        "",
        "ADVANCED (art crosses edges):",
        "1. Draw near the center only. Flatten the art.",
        "2. Make 4 copies. Move one by half the canvas",
        "   (1024 px) to each corner, with snapping on.",
        "3. Fill the gaps along the faint half lines.",
        "",
        "A flat color can fill edge to edge. A texture that",
        "touches the edges needs the advanced steps.",
        "Hide this layer. Share > PNG.",
    ], 40)
    save("keepsake-page-pattern", (w, h), g, base_color=(245, 238, 224, 255))


# 2. Washi tape: 3000 x 600, repeats left to right
def tape():
    w, h = 3000, 600
    m = 80
    g = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    d.rectangle([0, 0, w - 1, h - 1], outline=MAGENTA, width=6)
    dashed_line(d, (m, 0), (m, h), CYAN, 5)
    dashed_line(d, (w - m, 0), (w - m, h), CYAN, 5)
    text_block(d, (m + 40, 40), [
        "WASHI TAPE  3000 x 600",
        "Repeats left to right. Top and bottom are the tape edges: draw right to them.",
        "Keep motifs between the blue lines so the repeat has no seam.",
        "A flat background color can fill the whole strip. The app adds the see-through look and torn ends.",
        "Hide this layer. Share > PNG.",
    ], 34)
    save("keepsake-washi-tape", (w, h), g, base_color=(250, 214, 200, 255))


# 3. Sticker: 1200 x 1200, one sticker per canvas, transparent background
def sticker():
    w = h = 1200
    m = 72
    g = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    d.rectangle([0, 0, w - 1, h - 1], outline=MAGENTA, width=6)
    dashed_rect(d, (m, m, w - m, h - m), CYAN, 5)
    text_block(d, (m + 30, m + 30), [
        "STICKER  1200 x 1200",
        "One sticker per canvas.",
        "Keep it inside the blue line: the app",
        "adds a white edge and a soft shadow.",
        "Leave the background see-through.",
        "Hide this layer. Share > PNG.",
    ], 34)
    save("keepsake-sticker", (w, h), g)


if __name__ == "__main__":
    pattern()
    tape()
    sticker()
