"""Draws the placeholder 'Starter' scrap pack as SVG files plus pack.json.

The pack uses the same format a real scrap pack uses, so Richard's PNG art
replaces these files one for one.
"""
import json, os, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "app/packs/starter"
for d in ("stickers", "stamps", "tapes", "papers"):
    os.makedirs(os.path.join(OUT, d), exist_ok=True)

INK = "#3a2e2a"
RED = "#e4572e"
MUSTARD = "#f3a712"
TEAL = "#29a19c"
BLUE = "#3d5a80"
PINK = "#f4a6b7"
GREEN = "#7fb069"
CREAM = "#fff4e0"
WHITE = "#fffdf8"
KRAFT = "#c49a6c"

SW = 'stroke="%s" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"' % INK


def svg(w, h, body, defs=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
            f'{"<defs>" + defs + "</defs>" if defs else ""}{body}</svg>')


def write(rel, content):
    with open(os.path.join(OUT, rel), "w") as f:
        f.write(content)


# ---------- stickers (240 x 240) ----------
def star_points(cx, cy, r1, r2, n=5, rot=-90):
    import math
    pts = []
    for i in range(n * 2):
        r = r1 if i % 2 == 0 else r2
        a = math.radians(rot + i * 180 / n)
        pts.append(f"{cx + r * math.cos(a):.1f},{cy + r * math.sin(a):.1f}")
    return " ".join(pts)


STICKERS = {
    "star": ("Star", ["win", "best", "game"],
             f'<polygon points="{star_points(120,126,100,44)}" fill="{MUSTARD}" {SW}/>'
             f'<circle cx="98" cy="118" r="7" fill="{INK}"/><circle cx="142" cy="118" r="7" fill="{INK}"/>'
             f'<path d="M104 142 Q120 156 136 142" fill="none" {SW}/>'),
    "heart": ("Heart", ["love", "family", "friends"],
              f'<path d="M120 206 C40 150 20 104 46 70 C70 40 108 50 120 82 C132 50 170 40 194 70 C220 104 200 150 120 206Z" fill="{RED}" {SW}/>'
              f'<path d="M66 86 Q74 70 90 68" fill="none" stroke="{WHITE}" stroke-width="9" stroke-linecap="round"/>'),
    "die": ("Die", ["game", "board games", "dice"],
            f'<g transform="rotate(-12 120 120)"><rect x="36" y="36" width="168" height="168" rx="30" fill="{WHITE}" {SW}/>'
            + "".join(f'<circle cx="{x}" cy="{y}" r="14" fill="{INK}"/>' for x, y in [(80, 80), (160, 80), (120, 120), (80, 160), (160, 160)])
            + "</g>"),
    "meeple": ("Meeple", ["game", "board games"],
               f'<path d="M120 30 C146 30 158 50 156 72 C188 78 222 92 220 116 C218 134 194 134 172 128 L196 206 L146 206 L120 162 L94 206 L44 206 L68 128 C46 134 22 134 20 116 C18 92 52 78 84 72 C82 50 94 30 120 30Z" fill="{TEAL}" {SW}/>'),
    "card": ("Playing card", ["game", "cards"],
             f'<g transform="rotate(8 120 120)"><rect x="56" y="22" width="128" height="196" rx="16" fill="{WHITE}" {SW}/>'
             f'<path d="M120 152 C88 128 80 110 92 96 C102 84 116 88 120 100 C124 88 138 84 148 96 C160 110 152 128 120 152Z" fill="{RED}"/>'
             f'<path d="M76 72 L86 44 L96 72 M80 62 L92 62" fill="none" stroke="{RED}" stroke-width="6" stroke-linecap="round"/></g>'),
    "trophy": ("Trophy", ["win", "winner", "game"],
               f'<path d="M70 40 H170 V98 C170 130 148 150 120 150 C92 150 70 130 70 98Z" fill="{MUSTARD}" {SW}/>'
               f'<path d="M70 58 H40 C40 96 56 110 78 112 M170 58 H200 C200 96 184 110 162 112" fill="none" {SW}/>'
               f'<path d="M108 150 V176 H132 V150" fill="{MUSTARD}" {SW}/><rect x="78" y="176" width="84" height="26" rx="6" fill="{BLUE}" {SW}/>'),
    "sun": ("Sun", ["outdoors", "summer", "day"],
            "".join(f'<line x1="120" y1="20" x2="120" y2="48" {SW} transform="rotate({a} 120 120)"/>' for a in range(0, 360, 45))
            + f'<circle cx="120" cy="120" r="58" fill="{MUSTARD}" {SW}/>'),
    "flower": ("Flower", ["spring", "garden", "birthday"],
               "".join(f'<ellipse cx="120" cy="68" rx="30" ry="44" fill="{PINK}" {SW} transform="rotate({a} 120 120)"/>' for a in range(0, 360, 72))
               + f'<circle cx="120" cy="120" r="28" fill="{MUSTARD}" {SW}/>'),
    "balloon": ("Balloon", ["birthday", "party"],
                f'<path d="M120 172 Q108 196 126 212 Q140 224 128 236" fill="none" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>'
                f'<ellipse cx="120" cy="96" rx="66" ry="80" fill="{RED}" {SW}/><path d="M110 176 L130 176 L120 162Z" fill="{RED}" {SW}/>'
                f'<path d="M84 64 Q92 46 110 42" fill="none" stroke="{WHITE}" stroke-width="9" stroke-linecap="round"/>'),
    "cake": ("Cake", ["birthday", "party"],
             f'<rect x="44" y="112" width="152" height="90" rx="12" fill="{CREAM}" {SW}/>'
             f'<path d="M44 140 Q63 156 82 140 Q101 156 120 140 Q139 156 158 140 Q177 156 196 140" fill="none" stroke="{PINK}" stroke-width="12" stroke-linecap="round"/>'
             f'<rect x="112" y="64" width="16" height="48" rx="4" fill="{TEAL}" {SW}/><path d="M120 30 Q136 48 120 60 Q104 48 120 30Z" fill="{MUSTARD}" {SW}/>'),
    "leaf": ("Leaf", ["outdoors", "hike", "nature"],
             f'<path d="M50 196 C40 110 90 44 200 40 C206 140 150 196 50 196Z" fill="{GREEN}" {SW}/>'
             f'<path d="M50 196 C90 150 130 104 176 66" fill="none" {SW}/>'),
    "mountain": ("Mountain", ["outdoors", "hike", "trip"],
                 f'<path d="M14 196 L92 70 L138 140 L168 100 L228 196Z" fill="{BLUE}" {SW}/>'
                 f'<path d="M72 102 L92 70 L112 102 L100 96 L92 106 L84 96Z" fill="{WHITE}" {SW}/>'),
    "coffee": ("Coffee", ["food", "morning", "cafe"],
               f'<path d="M50 90 H170 V170 C170 196 150 210 124 210 H96 C70 210 50 196 50 170Z" fill="{WHITE}" {SW}/>'
               f'<path d="M170 110 C206 110 206 160 170 160" fill="none" {SW}/><rect x="62" y="104" width="96" height="16" fill="{KRAFT}"/>'
               f'<path d="M90 70 Q80 54 92 40 M126 70 Q116 54 128 40" fill="none" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>'),
    "pizza": ("Pizza", ["food", "dinner", "game night"],
              f'<path d="M30 60 Q120 20 210 60 L120 214Z" fill="{MUSTARD}" {SW}/><path d="M30 60 Q120 20 210 60 L200 82 Q120 46 40 82Z" fill="{KRAFT}" {SW}/>'
              + "".join(f'<circle cx="{x}" cy="{y}" r="13" fill="{RED}" stroke="{INK}" stroke-width="5"/>' for x, y in [(96, 104), (144, 110), (120, 152)])),
    "plane": ("Plane", ["trip", "travel", "vacation"],
              f'<g transform="rotate(-24 120 120)"><path d="M20 120 Q20 104 40 104 H190 Q224 104 224 120 Q224 136 190 136 H40 Q20 136 20 120Z" fill="{WHITE}" {SW}/>'
              f'<path d="M100 104 L132 44 H152 L140 104Z M100 136 L132 196 H152 L140 136Z M36 104 L28 74 H44 L62 104Z" fill="{TEAL}" {SW}/></g>'),
    "camera": ("Camera", ["photo", "memories", "trip"],
               f'<rect x="28" y="70" width="184" height="128" rx="18" fill="{BLUE}" {SW}/><path d="M84 70 L96 46 H144 L156 70" fill="{BLUE}" {SW}/>'
               f'<circle cx="120" cy="134" r="42" fill="{WHITE}" {SW}/><circle cx="120" cy="134" r="20" fill="{INK}"/><rect x="168" y="86" width="26" height="14" rx="4" fill="{MUSTARD}"/>'),
    "arrow": ("Arrow", ["note", "look"],
              f'<path d="M30 180 C60 70 150 60 196 96" fill="none" stroke="{INK}" stroke-width="10" stroke-linecap="round"/>'
              f'<path d="M168 70 L204 100 L160 116" fill="none" stroke="{INK}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>'),
    "sparkle": ("Sparkle", ["fun", "best"],
                f'<path d="M120 20 Q130 110 220 120 Q130 130 120 220 Q110 130 20 120 Q110 110 120 20Z" fill="{MUSTARD}" {SW}/>'
                f'<path d="M190 30 Q193 52 214 56 Q193 60 190 82 Q187 60 166 56 Q187 52 190 30Z" fill="{PINK}" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>'),
}

# ---------- stamps (300 x 300), single ink color, rough edges ----------
ROUGH = ('<filter id="rough" x="-5%" y="-5%" width="110%" height="110%">'
         '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n"/>'
         '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.35" result="m"/>'
         '<feComposite in="SourceGraphic" in2="m" operator="in" result="c"/>'
         '<feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="9" result="w"/>'
         '<feDisplacementMap in="c" in2="w" scale="4"/></filter>')
MONO = 'font-family="Courier New, Courier, monospace" font-weight="700"'


def stamp(body):
    return svg(300, 300, f'<g filter="url(#rough)" fill="#000" stroke="#000">{body}</g>', ROUGH)


STAMPS = {
    "postmark": ("Postmark", ["game night", "trip", "mail"], stamp(
        '<circle cx="150" cy="150" r="128" fill="none" stroke-width="10"/><circle cx="150" cy="150" r="104" fill="none" stroke-width="4"/>'
        '<path id="arc" d="M60 150 A90 90 0 0 1 240 150" fill="none" stroke="none"/>'
        f'<text {MONO} font-size="30" stroke="none"><textPath href="#arc" startOffset="50%" text-anchor="middle">GOOD TIMES</textPath></text>'
        '<polygon points="' + star_points(150, 170, 34, 14) + '" stroke="none"/>')),
    "best-day": ("Best day", ["birthday", "fun", "family"], stamp(
        '<rect x="20" y="90" width="260" height="120" rx="10" fill="none" stroke-width="10"/>'
        f'<text x="150" y="146" {MONO} font-size="44" text-anchor="middle" stroke="none">BEST DAY</text>'
        f'<text x="150" y="190" {MONO} font-size="36" text-anchor="middle" stroke="none">EVER</text>')),
    "winner": ("Winner", ["game", "win"], stamp(
        '<polygon points="' + star_points(150, 150, 140, 104, 12) + '" fill="none" stroke-width="8"/>'
        f'<text x="150" y="164" {MONO} font-size="46" text-anchor="middle" stroke="none">WINNER</text>')),
    "memories": ("Memories", ["memories", "family", "trip"], stamp(
        '<path d="M20 110 H280 L256 150 L280 190 H20 L44 150Z" fill="none" stroke-width="9"/>'
        f'<text x="150" y="163" {MONO} font-size="38" text-anchor="middle" stroke="none">MEMORIES</text>')),
    "hello": ("Hello", ["fun", "friends"], stamp(
        '<ellipse cx="150" cy="150" rx="132" ry="84" fill="none" stroke-width="9"/>'
        f'<text x="150" y="166" {MONO} font-size="50" text-anchor="middle" stroke="none">hello!</text>')),
    "heart-stamp": ("Heart", ["love", "family"], stamp(
        '<path d="M150 254 C40 180 20 116 54 76 C86 40 134 56 150 98 C166 56 214 40 246 76 C280 116 260 180 150 254Z" fill="none" stroke-width="12"/>'
        '<path d="M150 210 C90 168 80 132 98 112 C116 92 142 102 150 124 C158 102 184 92 202 112 C220 132 210 168 150 210Z" stroke="none"/>')),
}
STAMP_INKS = {"postmark": "#b5322c", "best-day": "#2f4b8a", "winner": "#b5322c", "memories": "#3b6e4f", "hello": "#2f4b8a", "heart-stamp": "#b5322c"}

# ---------- tapes (600 x 120 tile, repeats left to right) ----------
TAPES = {
    "stripe-red": ("Red stripe", f'<rect width="600" height="120" fill="{CREAM}"/>' + "".join(
        f'<polygon points="{x},0 {x+30},0 {x-30},120 {x-60},120" fill="{RED}"/>' for x in range(0, 720, 60))),
    "dots-teal": ("Teal dots", f'<rect width="600" height="120" fill="{TEAL}"/>' + "".join(
        f'<circle cx="{x + (25 if r % 2 else 0)}" cy="{20 + r * 40}" r="8" fill="{WHITE}"/>' for r in range(3) for x in range(0, 625, 50))),
    "grid-cream": ("Grid", f'<rect width="600" height="120" fill="{CREAM}"/>' + "".join(
        f'<line x1="{x}" y1="0" x2="{x}" y2="120" stroke="{BLUE}" stroke-width="2" opacity=".5"/>' for x in range(0, 600, 20)) + "".join(
        f'<line x1="0" y1="{y}" x2="600" y2="{y}" stroke="{BLUE}" stroke-width="2" opacity=".5"/>' for y in range(10, 120, 20))),
    "gingham-pink": ("Pink gingham", f'<rect width="600" height="120" fill="{WHITE}"/>' + "".join(
        f'<rect x="{x}" y="0" width="20" height="120" fill="{PINK}" opacity=".55"/>' for x in range(0, 600, 40)) + "".join(
        f'<rect x="0" y="{y}" width="600" height="20" fill="{PINK}" opacity=".55"/>' for y in range(0, 120, 40))),
    "mustard-plain": ("Mustard", f'<rect width="600" height="120" fill="{MUSTARD}"/>'
                      f'<path d="M0 60 Q75 40 150 60 T300 60 T450 60 T600 60" fill="none" stroke="{WHITE}" stroke-width="5"/>'),
    "kraft-stars": ("Kraft stars", f'<rect width="600" height="120" fill="{KRAFT}"/>' + "".join(
        f'<polygon points="{star_points(x, 60 + (22 if (x // 100) % 2 else -22), 16, 7)}" fill="{WHITE}"/>' for x in range(50, 600, 100))),
}

# ---------- papers (512 x 512 tile, seamless) ----------
NOISE = ('<filter id="grain" x="0" y="0" width="100%" height="100%">'
         '<feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" stitchTiles="stitch" seed="{seed}"/>'
         '<feColorMatrix type="matrix" values="0 0 0 0 {r}  0 0 0 0 {g}  0 0 0 0 {b}  0 0 0 {a} 0"/></filter>')


def paper(base, seed=2, tint=(0.35, 0.25, 0.15), alpha=0.22, extra=""):
    d = NOISE.format(seed=seed, r=tint[0], g=tint[1], b=tint[2], a=alpha)
    return svg(512, 512, f'<rect width="512" height="512" fill="{base}"/>{extra}<rect width="512" height="512" filter="url(#grain)"/>', d)


PAPERS = {
    "cream": ("Cream", paper("#f6eedd")),
    "kraft": ("Kraft", paper("#c8a27a", seed=5, tint=(0.25, 0.15, 0.05), alpha=0.35)),
    "grid": ("Grid", paper("#f8f5ee", extra="".join(
        f'<line x1="{i}" y1="0" x2="{i}" y2="512" stroke="#8fb3c9" stroke-width="1.5"/><line x1="0" y1="{i}" x2="512" y2="{i}" stroke="#8fb3c9" stroke-width="1.5"/>'
        for i in range(16, 512, 32)))),
    "dots": ("Dot grid", paper("#f8f5ee", extra="".join(
        f'<circle cx="{x}" cy="{y}" r="2.4" fill="#9a8f80"/>' for x in range(16, 512, 32) for y in range(16, 512, 32)))),
    "lined": ("Lined", paper("#fbf8f0", extra="".join(
        f'<line x1="0" y1="{y}" x2="512" y2="{y}" stroke="#9cc0d6" stroke-width="2"/>' for y in range(32, 512, 32)))),
    "blush": ("Blush", paper("#f3d9d3", seed=8, tint=(0.4, 0.2, 0.2), alpha=0.18)),
    "navy": ("Navy", paper("#2c3a55", seed=3, tint=(0.9, 0.9, 1.0), alpha=0.12)),
}

manifest = {"format": 1, "id": "starter", "name": "Starter (placeholder)", "artist": "Keepsake", "version": "0.1",
            "stickers": [], "stamps": [], "tapes": [], "papers": []}

for key, (name, tags, body) in STICKERS.items():
    write(f"stickers/{key}.svg", svg(240, 240, body))
    manifest["stickers"].append({"id": key, "file": f"stickers/{key}.svg", "name": name, "tags": tags})
for key, (name, tags, content) in STAMPS.items():
    write(f"stamps/{key}.svg", content)
    manifest["stamps"].append({"id": key, "file": f"stamps/{key}.svg", "name": name, "tags": tags, "ink": STAMP_INKS[key]})
for key, (name, body) in TAPES.items():
    write(f"tapes/{key}.svg", svg(600, 120, body))
    manifest["tapes"].append({"id": key, "file": f"tapes/{key}.svg", "name": name})
for key, (name, content) in PAPERS.items():
    write(f"papers/{key}.svg", content)
    manifest["papers"].append({"id": key, "file": f"papers/{key}.svg", "name": name, "tile": 300})

# Keep hand-drawn pieces (Richard's art) that are listed in pack.json but not drawn by this script.
_old = os.path.join(OUT, "pack.json")
if os.path.exists(_old):
    prev = json.load(open(_old))
    for kind in ("stickers", "stamps", "tapes", "papers"):
        made = {x["id"] for x in manifest[kind]}
        manifest[kind] = [x for x in prev.get(kind, []) if x["id"] not in made and "artist" in x] + manifest[kind]
with open(_old, "w") as f:
    json.dump(manifest, f, indent=1)
print("stickers", len(STICKERS), "stamps", len(STAMPS), "tapes", len(TAPES), "papers", len(PAPERS))
