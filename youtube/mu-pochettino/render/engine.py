"""Drawing + timeline engine for the MU video (graphics-only, no third-party images)."""
import math, os, wave, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
_fc = {}
def font(size, bold=True):
    k = (max(2, int(size)), bold)
    if k not in _fc:
        _fc[k] = ImageFont.truetype(FONT_B if bold else FONT_R, k[0])
    return _fc[k]

BG = (14, 17, 26); RED = (218, 41, 28); DRED = (110, 18, 18); YEL = (242, 194, 48)
GRN = (43, 182, 115); WHITE = (245, 245, 245); GREY = (120, 126, 140); BLUE = (80, 160, 255)
DARK = (28, 32, 44)

def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease_out(x): x = clamp(x); return 1 - (1 - x) ** 3
def ease_back(x):
    x = clamp(x); c1 = 1.70158; c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
def lerp(a, b, t): return a + (b - a) * t

class Ctx:
    """Per-frame drawing context. All sizes are relative to S = min(W, H)."""
    def __init__(self, img, t, dur):
        self.img = img; self.d = ImageDraw.Draw(img); self.W, self.H = img.size
        self.S = min(self.W, self.H); self.t = t; self.dur = dur
        self.p = t / dur if dur > 0 else 1.0
    def u(self, v): return v * self.S / 1080.0
    def cx(self, fx=0.5): return self.W * fx
    def cy(self, fy=0.5): return self.H * fy
    def text(self, s, x, y, size, color=WHITE, bold=True, anchor="mm", scale=1.0, alpha=1.0, stroke=0):
        if scale <= 0.01 or alpha <= 0.01: return
        f = font(self.u(size) * scale, bold)
        # auto-fit: never wider than 92% of the frame
        tw = self.d.textlength(s, font=f)
        if tw > self.W * 0.92:
            f = font(self.u(size) * scale * self.W * 0.92 / tw, bold)
        sw = int(self.u(stroke) * scale * f.size / max(1, self.u(size) * scale))
        if alpha >= 0.99:
            self.d.text((x, y), s, font=f, fill=color, anchor=anchor, stroke_width=sw, stroke_fill=(0, 0, 0))
            return
        l, t, r, b = self.d.textbbox((x, y), s, font=f, anchor=anchor, stroke_width=sw)
        l, t = int(l) - 2, int(t) - 2
        layer = Image.new("RGBA", (int(r) - l + 4, int(b) - t + 4), (0, 0, 0, 0))
        ImageDraw.Draw(layer).text((x - l, y - t), s, font=f, fill=color + (255,), anchor=anchor, stroke_width=sw, stroke_fill=(0, 0, 0, 255))
        a = layer.split()[3].point(lambda v: int(v * alpha))
        layer.putalpha(a)
        self.img.paste(layer, (l, t), layer)
    def pop_text(self, s, x, y, size, start, color=WHITE, dur=0.35, stroke=4):
        k = (self.t - start) / dur
        if k < 0: return
        self.text(s, x, y, size, color, scale=ease_back(k), stroke=stroke)
    def rrect(self, box, r, fill, outline=None, width=0):
        self.d.rounded_rectangle(box, radius=int(r), fill=fill, outline=outline, width=int(width))

# ---------------- backgrounds (cached) ----------------
_bgc = {}
def background(kind, W, H):
    k = (kind, W, H)
    if k in _bgc: return _bgc[k]
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    if kind.startswith("photo:"):
        src = os.path.join(PHOTO_DIR, kind[6:])
        ph = Image.open(src).convert("RGB")
        sc = max(W / ph.width, H / ph.height)
        ph = ph.resize((int(ph.width * sc) + 1, int(ph.height * sc) + 1), Image.LANCZOS)
        l = (ph.width - W) // 2; t = (ph.height - H) // 2
        ph = ph.crop((l, t, l + W, t + H)).filter(ImageFilter.GaussianBlur(radius=max(2, W // 400)))
        img = Image.blend(ph, Image.new("RGB", (W, H), (20, 4, 6)), 0.55)
    elif kind in ("anfield", "oldtrafford"):
        base = (120, 14, 20) if kind == "anfield" else (60, 12, 16)
        rows = 26
        for i in range(rows):
            y0 = int(H * 0.05 + i * H * 0.6 / rows)
            shade = 0.55 + 0.45 * (i / rows)
            col = tuple(int(c * shade) for c in base)
            d.rectangle([0, y0, W, y0 + int(H * 0.6 / rows) - 3], fill=col)
            # seat dots
            step = max(6, W // 120)
            for x in range(0, W, step):
                if (x // step + i) % 3 == 0:
                    d.point((x, y0 + 2), fill=tuple(min(255, c + 40) for c in col))
        d.rectangle([0, int(H * 0.68), W, H], fill=(22, 70, 34))
        for i in range(8):
            if i % 2 == 0:
                d.rectangle([0, int(H * 0.68 + i * H * 0.04), W, int(H * 0.68 + (i + 1) * H * 0.04)], fill=(26, 82, 40))
        img = img.filter(ImageFilter.GaussianBlur(radius=max(2, W // 300)))
        dark = Image.new("RGB", (W, H), (0, 0, 0))
        img = Image.blend(img, dark, 0.45)
    elif kind in ("plain", "dark", "grid"):
        yy, xx = np.mgrid[0:H, 0:W]
        r = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H * 0.42) / (H * 0.75)) ** 2)
        kk = np.clip(1 - r, 0, 1)[..., None] ** 1.2
        inner = np.array((150, 18, 22) if kind != "dark" else (105, 12, 16), float); outer = np.array((34, 4, 8), float)
        arr = outer * (1 - kk) + inner * kk
        img = Image.fromarray(arr.astype(np.uint8))
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
        step = min(W, H) // 12
        for x in range(W // 2 % step, W, step): od.line([x, 0, x, H], fill=(255, 255, 255, 34), width=2)
        for y in range(H // 2 % step, H, step): od.line([0, y, W, y], fill=(255, 255, 255, 34), width=2)
        img = Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")
    else:
        top = np.array(BG, float); bot = np.array((24, 18, 30) if kind == "dark" else (30, 12, 14), float)
        g = np.linspace(0, 1, H)[:, None, None]
        arr = top * (1 - g) + bot * g
        arr = np.repeat(arr, W, axis=1)
        rng = np.random.default_rng(1)
        arr += rng.normal(0, 3, arr.shape)
        img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    # vignette
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    v = np.clip(1.15 - 0.45 * r, 0.55, 1.0)[..., None]
    img = Image.fromarray((np.asarray(img, float) * v).astype(np.uint8))
    _bgc[k] = img
    return img

# ---------------- props ----------------
PHOTO_DIR = os.environ.get("PHOTO_DIR", "")
_cut = {}
def cutout(key):
    """User-supplied photo -> background-removed RGBA (cached on disk). None if no photo."""
    if key in _cut: return _cut[key]
    im = None
    if PHOTO_DIR and key:
        src = next((os.path.join(PHOTO_DIR, f) for f in sorted(os.listdir(PHOTO_DIR))
                    if os.path.splitext(f)[0].lower() == key.lower() and not f.endswith(".cut.png")), None)
        if src:
            cache = os.path.join(PHOTO_DIR, key.lower() + ".cut.png")
            if not os.path.exists(cache):
                from rembg import remove, new_session
                out = remove(Image.open(src).convert("RGB"), session=new_session("u2net_human_seg"))
                bb = out.split()[3].point(lambda v: 255 if v > 20 else 0).getbbox()
                out.crop(bb).save(cache)
            im = Image.open(cache).convert("RGBA")
    _cut[key] = im
    return im

def silhouette(c, x, y, size, name, color=(52, 58, 76), variant="neutral", alpha=1.0, photo=None):
    """Person cut-out: the user's photo if one was supplied, else a generic placeholder (no real likeness)."""
    u = c.u(size)
    d = c.d
    im = cutout(photo or name)
    if im is not None:
        h = int(u * 1.75); w = int(im.width * h / im.height)
        if w > c.W * 0.55: w = int(c.W * 0.55); h = int(im.height * w / im.width)
        sm = im.resize((max(1, w), max(1, h)), Image.LANCZOS)
        top = int(y + u * 1.02 - h)
        c.img.paste(sm, (int(x - w / 2), top), sm)
        if name:
            c.rrect([x - u * 0.6, y + u * 0.8, x + u * 0.6, y + u * 1.0], u * 0.05, RED)
            c.text(name, x, y + u * 0.9, size * 0.12)
        return
    lw = int(max(2, u * 0.02))
    # neck + shoulders (trapezoid torso with rounded top)
    d.rectangle([x - u * 0.09, y - u * 0.05, x + u * 0.09, y + u * 0.12], fill=color)
    d.chord([x - u * 0.6, y + u * 0.08, x + u * 0.6, y + u * 0.6], 180, 360, fill=color, outline=WHITE, width=lw)
    d.polygon([(x - u * 0.6, y + u * 0.34), (x + u * 0.6, y + u * 0.34), (x + u * 0.66, y + u * 0.78), (x - u * 0.66, y + u * 0.78)], fill=color)
    d.line([(x - u * 0.6, y + u * 0.34), (x - u * 0.66, y + u * 0.78)], fill=WHITE, width=lw)
    d.line([(x + u * 0.6, y + u * 0.34), (x + u * 0.66, y + u * 0.78)], fill=WHITE, width=lw)
    # head
    d.ellipse([x - u * 0.22, y - u * 0.45, x + u * 0.22, y + u * 0.0], fill=color, outline=WHITE, width=int(max(2, u * 0.02)))
    if variant == "arms":
        d.rounded_rectangle([x - u * 0.45, y + u * 0.32, x + u * 0.45, y + u * 0.48], radius=int(u * 0.08), fill=tuple(min(255, k + 25) for k in color), outline=WHITE, width=int(max(2, u * 0.015)))
    if variant == "headinhands":
        for s in (-1, 1):
            d.ellipse([x + s * u * 0.18 - u * 0.1, y - u * 0.3, x + s * u * 0.18 + u * 0.1, y - u * 0.08], fill=tuple(min(255, k + 30) for k in color), outline=WHITE, width=int(max(2, u * 0.015)))
    if name:
        c.rrect([x - u * 0.6, y + u * 0.8, x + u * 0.6, y + u * 1.0], u * 0.05, RED)
        c.text(name, x, y + u * 0.9, size * 0.12)

def flower(c, x, y, r):
    for i in range(6):
        a = i * math.pi / 3
        c.d.ellipse([x + math.cos(a) * r * 0.6 - r * 0.45, y + math.sin(a) * r * 0.6 - r * 0.45,
                     x + math.cos(a) * r * 0.6 + r * 0.45, y + math.sin(a) * r * 0.6 + r * 0.45], fill=WHITE)
    c.d.ellipse([x - r * 0.35, y - r * 0.35, x + r * 0.35, y + r * 0.35], fill=YEL)

def clover(c, x, y, r):
    c.d.line([x, y, x + r * 0.4, y + r * 1.4], fill=(30, 140, 60), width=int(r * 0.15))
    for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        c.d.ellipse([x + dx * r * 0.45 - r * 0.5, y + dy * r * 0.45 - r * 0.5, x + dx * r * 0.45 + r * 0.5, y + dy * r * 0.45 + r * 0.5], fill=(46, 170, 80))

def popcorn(c, x, y, r):
    box = [x - r * 0.7, y - r * 0.2, x + r * 0.7, y + r * 1.2]
    c.d.polygon([(box[0], box[1]), (box[2], box[1]), (box[2] - r * 0.15, box[3]), (box[0] + r * 0.15, box[3])], fill=WHITE)
    for i in range(3):
        sx = box[0] + r * 0.2 + i * r * 0.45
        c.d.polygon([(sx, box[1]), (sx + r * 0.2, box[1]), (sx + r * 0.17, box[3]), (sx + r * 0.05, box[3])], fill=RED)
    for dx, dy in ((-0.45, -0.35), (0, -0.5), (0.45, -0.35), (-0.2, -0.65), (0.25, -0.7)):
        c.d.ellipse([x + dx * r - r * 0.28, y + dy * r - r * 0.28, x + dx * r + r * 0.28, y + dy * r + r * 0.28], fill=(255, 240, 200))

def chair(c, x, y, r):
    col = (150, 100, 60)
    c.d.rectangle([x - r * 0.6, y - r * 1.2, x - r * 0.45, y + r], fill=col)
    c.d.rectangle([x - r * 0.6, y - r * 1.2, x + r * 0.1, y - r * 1.05], fill=col)
    c.d.rectangle([x - r * 0.6, y - r * 0.05, x + r * 0.6, y + r * 0.12], fill=col)
    c.d.rectangle([x + r * 0.45, y, x + r * 0.6, y + r], fill=col)

def tear(c, x, y, r):
    c.d.polygon([(x, y - r * 1.3), (x - r * 0.7, y), (x + r * 0.7, y)], fill=BLUE)
    c.d.ellipse([x - r * 0.7, y - r * 0.7, x + r * 0.7, y + r * 0.7], fill=BLUE)

def star(c, x, y, r, col=YEL):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((x + math.cos(a) * rr, y + math.sin(a) * rr))
    c.d.polygon(pts, fill=col)

def stopwatch(c, x, y, r, frac):
    c.d.ellipse([x - r, y - r, x + r, y + r], fill=WHITE, outline=GREY, width=int(r * 0.08))
    c.d.rectangle([x - r * 0.15, y - r * 1.3, x + r * 0.15, y - r * 1.0], fill=GREY)
    a = -math.pi / 2 + 2 * math.pi * frac
    c.d.line([x, y, x + math.cos(a) * r * 0.8, y + math.sin(a) * r * 0.8], fill=RED, width=int(r * 0.1))
    c.text(f"{int(round(frac * 90))}'", x, y + r * 0.45, r * 0.35 * 1080 / c.S, DARK)

def pin(c, x, y, r):
    c.d.line([x, y, x, y + r * 1.4], fill=GREY, width=int(r * 0.15))
    c.d.ellipse([x - r * 0.5, y - r * 0.5, x + r * 0.5, y + r * 0.5], fill=RED)

def hourglass(c, x, y, r, frac):
    c.d.polygon([(x - r * 0.7, y - r), (x + r * 0.7, y - r), (x, y)], outline=WHITE, width=int(r * 0.06))
    c.d.polygon([(x - r * 0.7, y + r), (x + r * 0.7, y + r), (x, y)], outline=WHITE, width=int(r * 0.06))
    top = 1 - frac
    c.d.polygon([(x - r * 0.7 * top, y - r * top), (x + r * 0.7 * top, y - r * top), (x, y)], fill=YEL)
    b = frac
    c.d.polygon([(x - r * 0.7 * b, y + r), (x + r * 0.7 * b, y + r), (x, y + r * (1 - b))], fill=YEL)

def squares(c, x, y, size, cols, revealed, highlight=None, glow=0.0, convert=None):
    """Row of result squares. cols: list of colors."""
    n = len(cols); s = c.u(size); gap = s * 0.18
    x0 = x - (n * s + (n - 1) * gap) / 2
    for i, col in enumerate(cols):
        k = clamp(revealed - i)
        if k <= 0: continue
        sc = ease_back(k)
        if highlight is not None and col == highlight: sc *= 1 + 0.25 * glow
        if convert is not None and i == convert[0]:
            col = tuple(int(lerp(a, b, convert[1])) for a, b in zip(col, GRN))
        cxx = x0 + i * (s + gap) + s / 2
        hs = s * sc / 2
        c.rrect([cxx - hs, y - hs, cxx + hs, y + hs], s * 0.15, col)
        lab = {GRN: "T", YEL: "H", RED: "B"}.get(cols[i], "")
        if convert is not None and i == convert[0] and convert[1] > 0.5: lab = "T"
        c.text(lab, cxx, y, size * 0.45 * sc, DARK)

def league_table(c, x, y, w, highlight_p=1.0, arrow=0.0):
    rows = [("16", "…", ""), ("17", "Coventry", "9"), ("18", "Man Utd", "8"), ("19", "…", ""), ("20", "…", "")]
    rh = c.u(96); x0 = x - w / 2
    c.rrect([x0 - c.u(20), y - c.u(70), x0 + w + c.u(20), y + rh * len(rows) + c.u(10)], c.u(18), DARK)
    c.text("NGOẠI HẠNG ANH · 20/11", x0, y - c.u(35), 32, GREY, anchor="lm")
    c.text("ĐIỂM", x0 + w, y - c.u(35), 32, GREY, anchor="rm")
    for i, (pos, team, pts) in enumerate(rows):
        yy = y + i * rh
        if team == "Man Utd":
            k = ease_out(highlight_p)
            c.rrect([x0 - c.u(10), yy + c.u(4), x0 - c.u(10) + (w + c.u(20)) * k, yy + rh - c.u(4)], c.u(10), RED)
        c.text(pos, x0 + c.u(20), yy + rh / 2, 44, WHITE, anchor="lm")
        c.text(team, x0 + c.u(120), yy + rh / 2, 44, WHITE if team != "…" else GREY, anchor="lm")
        c.text(pts, x0 + w - c.u(10), yy + rh / 2, 46, WHITE, anchor="rm")
    # relegation line between 17 and 18
    ly = y + 2 * rh
    if int(c.t * 3) % 2 == 0 or highlight_p < 1:
        c.d.line([x0 - c.u(20), ly, x0 + w + c.u(20), ly], fill=(255, 60, 60), width=int(c.u(6)))
    c.text("vùng xuống hạng", x0 + w + c.u(40), y + 3.5 * rh, 32, (255, 90, 90), anchor="lm") if c.W > c.H else None
    if arrow > 0:
        ax = x0 + w + c.u(60)
        c.d.line([ax, y + 2.5 * rh, ax, y + 1.5 * rh + c.u(10)], fill=YEL, width=int(c.u(8)))
        c.d.polygon([(ax - c.u(20), y + 1.5 * rh + c.u(20)), (ax + c.u(20), y + 1.5 * rh + c.u(20)), (ax, y + 1.5 * rh - c.u(10))], fill=YEL)
        c.pop_text("+1 điểm", ax + c.u(20), y + 2 * rh, 34, start=c.dur * 0.35, color=YEL, stroke=0) if c.W > c.H else None

def card(c, x, y, w, h, title, sub=None, col=DARK, k=1.0):
    if k <= 0: return
    sc = ease_back(k)
    hw, hh = w * sc / 2, h * sc / 2
    c.rrect([x - hw, y - hh, x + hw, y + hh], c.u(20), col, outline=(70, 76, 92), width=c.u(2))
    c.text(title, x, y - (c.u(22) if sub else 0), 40 * sc)
    if sub: c.text(sub, x, y + c.u(32), 28 * sc, GREY, bold=False)

def subtitle(img, text, frac_y=0.88, maxw=0.86, size=40):
    """Burned-in subtitle box."""
    W, H = img.size; S = min(W, H); d = ImageDraw.Draw(img)
    f = font(size * S / 1080, True)
    words = text.split(); lines = []; cur = ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) > W * maxw and cur:
            lines.append(cur); cur = w
        else: cur = t
    if cur: lines.append(cur)
    lh = f.size * 1.3
    y0 = H * frac_y - lh * len(lines) / 2
    for i, l in enumerate(lines):
        d.text((W / 2, y0 + i * lh + lh / 2), l, font=f, fill=WHITE, anchor="mm",
               stroke_width=max(2, int(f.size * 0.12)), stroke_fill=(0, 0, 0))

# ---------------- audio ----------------
SR = 22050
def sfx(kind):
    n = int(SR * (0.18 if kind == "pop" else 0.35)); t = np.arange(n) / SR
    if kind == "pop":
        f = 900 * np.exp(-t * 18) + 250
        return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 22) * 0.35).astype(np.float32)
    if kind == "whoosh":
        rng = np.random.default_rng(2); x = rng.normal(0, 1, n)
        x = np.convolve(x, np.ones(30) / 30, "same")
        env = np.sin(np.pi * t / t[-1]) ** 2
        return (x * env * 0.5).astype(np.float32)
    if kind == "boom":
        return (np.sin(2 * np.pi * 55 * t) * np.exp(-t * 6) * 0.6).astype(np.float32)
    return np.zeros(n, np.float32)

def read_wav(path):
    with wave.open(path) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        return a, w.getframerate()

def write_wav(path, a):
    a = np.clip(a, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((a * 32767).astype(np.int16).tobytes())

# ---------------- render loop ----------------
def render(shots, W, H, fps, audio_path, out_path, sub_y=0.88, sub_size=40, header=None, zoom=0.04):
    """shots: list of dict(start, dur, bg, draw(c), sub)."""
    total = shots[-1]["start"] + shots[-1]["dur"]
    nframes = int(math.ceil(total * fps))
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps),
           "-i", "-", "-i", audio_path, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out_path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    si = 0
    for fi in range(nframes):
        t = fi / fps
        while si < len(shots) - 1 and t >= shots[si + 1]["start"]: si += 1
        sh = shots[si]; lt = t - sh["start"]
        img = background(sh.get("bg", "plain"), W, H).copy()
        c = Ctx(img, lt, sh["dur"])
        sh["draw"](c)
        # slow push-in so no frame is ever static
        z = 1 + zoom * c.p
        if z > 1.001:
            cw, ch = int(W / z), int(H / z)
            img = img.crop(((W - cw) // 2, (H - ch) // 2, (W - cw) // 2 + cw, (H - ch) // 2 + ch)).resize((W, H), Image.BILINEAR)
        if header: header(img)
        if sh.get("sub"): subtitle(img, sh["sub"], sub_y, size=sub_size)
        proc.stdin.write(img.tobytes())
    proc.stdin.close(); proc.wait()
    return total
