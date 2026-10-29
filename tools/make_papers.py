"""Paper textures as seamless 512 px PNG tiles (fibers + grain), plus line patterns."""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

OUT = sys.argv[1] if len(sys.argv) > 1 else "app/packs/starter"
N = 512
rng = np.random.default_rng(7)

def wrap_blur(a, r):
    # box blur with wrap-around edges keeps the tile seamless
    out = a.copy()
    for axis in (0, 1):
        acc = np.zeros_like(out)
        for s in range(-r, r + 1):
            acc += np.roll(out, s, axis=axis)
        out = acc / (2 * r + 1)
    return out

def texture(base, amount, fiber=0.5):
    fine = rng.normal(0, 1, (N, N))
    soft = wrap_blur(rng.normal(0, 1, (N, N)), 6); soft /= soft.std()
    streak = wrap_blur(rng.normal(0, 1, (N, N)), 1)
    streak = np.mean([np.roll(streak, k, axis=1) for k in range(0, 24, 3)], axis=0); streak /= streak.std()
    n = 0.45 * fine + 0.35 * soft + fiber * 0.35 * streak
    rgb = np.array(base, dtype=float)[None, None, :] + amount * n[..., None]
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")

def lines(img, draw_fn):
    d = ImageDraw.Draw(img, "RGBA"); draw_fn(d); return img

papers = {
    "cream": ("Cream", texture((246, 238, 221), 7)),
    "kraft": ("Kraft", texture((196, 158, 118), 12, fiber=1.0)),
    "grid": ("Grid", lines(texture((248, 245, 238), 5), lambda d: [d.line([(i, 0), (i, N)], fill=(120, 165, 196, 120), width=2) or d.line([(0, i), (N, i)], fill=(120, 165, 196, 120), width=2) for i in range(16, N, 32)])),
    "dots": ("Dot grid", lines(texture((248, 245, 238), 5), lambda d: [d.ellipse([x - 2.5, y - 2.5, x + 2.5, y + 2.5], fill=(140, 128, 112, 200)) for x in range(16, N, 32) for y in range(16, N, 32)])),
    "lined": ("Lined", lines(texture((251, 248, 240), 5), lambda d: [d.line([(0, y), (N, y)], fill=(130, 175, 205, 150), width=2) for y in range(32, N + 1, 32)])),
    "blush": ("Blush", texture((242, 216, 210), 7)),
    "navy": ("Navy", texture((44, 58, 85), 8)),
}
m = json.load(open(os.path.join(OUT, "pack.json")))
for f in os.listdir(os.path.join(OUT, "papers")):
    os.remove(os.path.join(OUT, "papers", f))
m["papers"] = []
for key, (name, img) in papers.items():
    img.save(os.path.join(OUT, "papers", key + ".png"), optimize=True)
    m["papers"].append({"id": key, "file": f"papers/{key}.png", "name": name, "tile": 300})
json.dump(m, open(os.path.join(OUT, "pack.json"), "w"), indent=1)
print("ok")
