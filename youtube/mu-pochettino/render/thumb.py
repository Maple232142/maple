"""Thumbnail 1280x720: cut-out on red grid + 'ANFIELD / ĐANG CHỜ'."""
import sys
from engine import *
W, H = 1280, 720
img = background("grid", W, H).copy()
c = Ctx(img, 1, 1)
im = cutout("Pochettino")
if im is not None:
    h = int(H * 0.98); w = int(im.width * h / im.height)
    sm = im.resize((w, h), Image.LANCZOS)
    img.paste(sm, (W - w + int(w * 0.05), H - h), sm)
d = ImageDraw.Draw(img)
d.text((60, 250), "ANFIELD", font=font(150), fill=WHITE, anchor="lm", stroke_width=8, stroke_fill=(0, 0, 0))
d.text((60, 420), "ĐANG CHỜ", font=font(130), fill=YEL, anchor="lm", stroke_width=8, stroke_fill=(0, 0, 0))
img.save(sys.argv[1]); print(sys.argv[1])
