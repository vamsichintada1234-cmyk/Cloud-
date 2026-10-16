"""Split-layout assets: superellipse card mask, 3-layer card shadow, 40 px head feather (1080x1920)."""
import numpy as np
from PIL import Image, ImageFilter
W, H, SS = 1080, 1920, 4
CX, CY, CW, CH, R = -65, 1200, 1210, 864, 200
def squircle_mask(ss=SS, n=4.0):
    w, h = W*ss, H*ss
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32) / ss + 0.5/ss
    x0, y0, x1, y1 = CX, CY, CX+CW, CY+CH
    dx = np.maximum(np.maximum(x0+R - xs, xs - (x1-R)), 0); dy = np.maximum(np.maximum(y0+R - ys, ys - (y1-R)), 0)
    inside = (xs >= x0) & (xs <= x1) & (ys >= y0) & (ys <= y1) & ((dx/R)**n + (dy/R)**n <= 1)
    img = Image.fromarray((inside*255).astype(np.uint8)); return img.resize((W, H), Image.LANCZOS)
m = squircle_mask(); m.save("edit/work/card_mask.png")
a = np.asarray(m).astype(np.float32)/255
# three-layer shadow (offset y, blur, alpha) - CSS blur radius ~ 2*sigma
sh = np.zeros((H, W), np.float32)
for oy, blur, al in ((60, 120, 0.16), (24, 48, 0.10), (4, 10, 0.06)):
    sa = np.zeros_like(a); sa[oy:] = a[:-oy]   # shift down, no wrap-around
    s = Image.fromarray((sa*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur/2))
    s = np.asarray(s).astype(np.float32)/255*al; sh = 1 - (1-sh)*(1-s)
sh *= (1 - a)        # only outside the card
rgba = np.zeros((H, W, 4), np.uint8); rgba[..., :3] = (24, 24, 32); rgba[..., 3] = np.clip(sh*255, 0, 255)
Image.fromarray(rgba, "RGBA").save("edit/work/card_shadow.png")
# head feather: opaque above y=1180, linear to 0 at y=1220 (40 px across the card's top edge)
y = np.arange(H)[:, None].repeat(W, 1).astype(np.float32)
f = np.clip((1220 - y)/40, 0, 1); Image.fromarray((f*255).astype(np.uint8)).save("edit/work/head_feather.png")
print("ok", a.sum())
