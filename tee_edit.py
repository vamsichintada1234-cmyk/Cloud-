"""Custom photo tee reel: beat-synced 9-shot edit (1080x1920 @ 25fps). Run tee_music.py first.
All cuts, text reveals and whips are placed on beats from raw/tee/music.json, relative to the detected
drop (D) and final strong beat (E). Renders output/tee_reel.mp4 (or _preview with --preview)."""
import json, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

R = "/home/user/Cloud-/raw/tee/"; A = "/home/user/Cloud-/assets/"
W, H, FPS = 1080, 1920, 25
PREVIEW = "--preview" in sys.argv
HEAD_FONT = A + "fonts/Anton-Regular.woff"
SUB_FONT = "/usr/share/fonts/opentype/inter/InterDisplay-Black.otf"
YELLOW, WHITE = (255, 210, 0), (255, 255, 255)

M = json.load(open(R + "music.json"))
B, ACC = M["beats"], M["accent"]
TPB = M["ticks_per_beat"]            # cut plan below is in ticks; 2 ticks = 1 felt beat (~81 BPM here)
D, E, Q = M["drop"], M["end_hit"], M["quiet"]
TOTAL = M["duration"]
BEAT = float(np.median(np.diff(B))) * TPB   # seconds per felt beat
fr = lambda t: int(round(t * FPS))
NF = fr(TOTAL)

# Shot plan. start = tick the shot lands on (relative to drop D / end hit E); the shot runs to the next start.
# (name, start tick, clip, source in, speed, zoom from, zoom to, focus x, focus y, whip in)
SHOTS = [
    ("hero",     None,   "02",  0.2, 1.0, 1.00, 1.06, 0.50, 0.42, False),  # tee on carpet, slow push-in
    ("reveal",   D - 36, "01",  1.3, 1.2, 1.06, 1.10, 0.50, 0.35, True),   # holds transfer up, smiles
    ("grab",     D - 30, "01", 21.9, 1.0, 1.04, 1.04, 0.50, 0.40, False),  # pulls the tee onto the press
    ("prep",     D - 24, "01", 28.6, 1.0, 1.08, 1.12, 0.45, 0.45, False),  # positions the transfer sheet
    ("press",    D - 17, "01", 38.6, 1.0, 1.04, 1.08, 0.40, 0.40, False),  # pulls the handle down
    ("wait",     D - 10, "01", 42.0, 1.0, 1.04, 1.10, 0.55, 0.40, False),  # still while the press holds
    ("wait_in",  D - 4,  "01", 46.0, 1.0, 1.40, 1.48, 0.55, 0.32, False),  # punch-in, quiet pocket
    ("lift",     D,      "01", 52.0, 1.5, 1.04, 1.04, 0.45, 0.40, False),  # lifts the press  (drop)
    ("peel",     D + 2,  "01", 56.3, 1.5, 1.08, 1.08, 0.55, 0.40, False),  # peels, grins at camera
    ("overhead", D + 4,  "02", 28.5, 0.5, 1.02, 1.08, 0.50, 0.45, False),  # slow-mo overhead
    ("tilted",   D + 7,  "02", 31.3, 0.5, 1.10, 1.16, 0.50, 0.45, True),   # whip to tilted print, slow-mo
    ("callout",  D + 10, "03", 11.3, 1.5, 1.04, 1.04, 0.50, 0.40, False),  # points, fist bump, tee in hand
    ("endcard",  E,      "02", 34.0, 1.0, 1.00, 1.06, 0.50, 0.42, False),  # darkened tee under end card
]
# Headlines (\n = line break): (text, first tick, last tick, pop ticks for the yellow period/dots or None = next strong beat)
HEADS = [
    ("YOUR PHOTO,\nON A TEE.", 0,    D - 36, None),
    ("IT STARTS WITH\nA PRINT.", D - 36, D - 24, None),
    ("LINE IT UP.",           D - 24, D - 17, None),
    ("PRESS IT DOWN.",        D - 17, D - 10, None),
    ("WAIT FOR IT...",        D - 4,  D,      [Q, Q + 1, Q + 2]),  # dots pop one per tick across the quiet pocket
    ("AND IT'S DONE.",        D,      D + 4,  None),
    ("YOUR TURN.",            D + 10, E,      None),
]
END_SUB = ["CUSTOM PHOTO TEES", "LINK IN BIO"]
WHIP_PRE = 3                                     # whip starts this many frames before the beat


def tick_t(k): return B[k] if k is not None else 0.0
def next_strong(k): return k + 1 if ACC[k + 1] >= ACC[min(k + 2, len(B) - 1)] else k + 2  # next beat, whichever tick hits harder


starts = [fr(tick_t(s[1])) for s in SHOTS] + [NF]
# a whip-in shot appears one frame early (blurred) so it is sharp exactly on its beat
starts = [st - (1 if i < len(SHOTS) and SHOTS[i][9] else 0) for i, st in enumerate(starts)]
for i, s in enumerate(SHOTS):
    n = starts[i + 1] - starts[i]
    print(f"{s[0]:9s} tick {str(s[1]):>4s} @ {starts[i] / FPS:6.2f}s  {n:3d}f = {n / FPS / BEAT:3.1f} beats")


def decode(clip, t_in, speed, zmax, n):
    """n frames of the clip from t_in at the given speed, scaled to (W, H) * zmax."""
    ow, oh = int(W * zmax) // 2 * 2, int(H * zmax) // 2 * 2
    src_dur = n / FPS * speed + 0.2
    vf = []
    if speed < 1:   # real slow motion: motion-interpolate to the extra frames we need
        vf += [f"scale={ow}:{oh}:flags=bicubic", f"minterpolate=fps={round(FPS / speed)}:mi_mode=mci:mc_mode=aobmc:vsbmc=1",
               f"setpts=PTS/{speed}"]
    else:
        vf += [f"setpts=PTS/{speed}", f"scale={ow}:{oh}:flags=bicubic"]
    vf += [f"fps={FPS}", "eq=contrast=1.06:saturation=1.12", "format=rgb24"]
    cmd = ["ffmpeg", "-v", "error", "-ss", str(t_in), "-t", f"{src_dur:.3f}", "-i", R + clip + ".MP4",
           "-map", "0:v:0", "-vf", ",".join(vf), "-frames:v", str(n), "-f", "rawvideo", "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, oh, ow, 3)
    if len(frames) < n: frames = np.concatenate([frames, np.repeat(frames[-1:], n - len(frames), 0)])
    return frames, zmax


def frame_at(frames, zmax, z, fx, fy):
    """Crop a W/z x H/z window (in output pixels) around the focus point and resize to W x H."""
    sh, sw = frames.shape[:2]
    cw, ch = min(W * zmax / z, sw), min(H * zmax / z, sh)
    x0 = min(max(fx * sw - cw / 2, 0), sw - cw); y0 = min(max(fy * sh - ch / 2, 0), sh - ch)
    return Image.fromarray(frames).resize((W, H), Image.BILINEAR, box=(x0, y0, x0 + cw, y0 + ch))


def hblur(a, k):
    """Horizontal box blur of width k (motion blur for whips)."""
    if k < 2: return a
    c = np.cumsum(np.pad(a.astype(np.float32), ((0, 0), (k // 2 + 1, k - k // 2 - 1), (0, 0)), mode="edge"), axis=1)
    return ((c[:, k:] - c[:, :-k]) / k).astype(np.uint8)


# ---------- text ----------
HF = {s: ImageFont.truetype(HEAD_FONT, s) for s in (118, 150)}
SF = ImageFont.truetype(SUB_FONT, 64)


def wrap(text, font, maxw):
    lines = []
    for para in text.split("\n"):
        cur = ""
        for w in para.split():
            t = (cur + " " + w).strip()
            if cur and font.getlength(t) > maxw: lines.append(cur); cur = w
            else: cur = t
        lines.append(cur)
    return lines


def ease(x): x = min(max(x, 0), 1); return 1 - (1 - x) ** 3
def pop(x):  # 0 -> overshoot 1.35 -> 1 over the pop
    if x <= 0: return 0
    return 1.35 * ease(x / 0.5) if x < 0.5 else 1.35 - 0.35 * ease((x - 0.5) / 0.5)


def draw_headline(layer, text, t, t0, pops, size=118, cy=1330):
    """Words build in on t0 (staggered rise + fade); the trailing yellow period/dots pop at the pop times."""
    font = HF[size]
    body = text.rstrip(".")
    dots = len(text) - len(body)
    lines = wrap(body, font, 900)
    lh = size * 1.12
    y = cy - lh * len(lines) / 2
    d = ImageDraw.Draw(layer)
    widx = 0
    for li, line in enumerate(lines):
        words = line.split()
        dotw = font.getlength(".") * dots if li == len(lines) - 1 else 0
        x = (W - font.getlength(line) - dotw) / 2
        for w in words:
            k = ease((t - t0 - widx * 0.06) / 0.22)
            if k > 0:
                d.text((x, y + (1 - k) * 40), w, font=font, fill=WHITE + (int(255 * k),))
            x += font.getlength(w + " "); widx += 1
        if li == len(lines) - 1:
            x -= font.getlength(" ")
            for j in range(dots):
                s = pop((t - pops[min(j, len(pops) - 1)]) / 0.2)
                if s > 0:
                    dw = font.getlength(".")
                    sz = max(int(size * s), 1)
                    f2 = ImageFont.truetype(HEAD_FONT, sz)
                    # scale about the dot's baseline so it grows in place
                    d.text((x + dw / 2 - f2.getlength(".") / 2, y + size - sz), ".", font=f2, fill=YELLOW + (255,))
                x += font.getlength(".")
        y += lh


def text_layer(t):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for text, a, b, pops in HEADS:
        t0, t1 = B[a], B[b]
        if t0 <= t < t1:
            pt = [B[k] for k in pops] if pops else [B[next_strong(a)]]
            draw_headline(layer, text, t, t0, pt)
    te = B[E]
    if t >= te:
        pe = B[next_strong(E)]
        draw_headline(layer, "ORDER YOURS.", t, te, [pe], size=150, cy=880)
        d = ImageDraw.Draw(layer)
        for i, s in enumerate(END_SUB):   # sub lines follow on the next two beats after the pop
            k = ease((t - B[min(next_strong(E) + TPB * (i + 1) - 1, len(B) - 1)]) / 0.2)
            if k > 0:
                tw = SF.getlength(s)
                d.text(((W - tw) / 2, 1010 + i * 86 + (1 - k) * 24), s, font=SF,
                       fill=(YELLOW if i == 1 else WHITE) + (int(255 * k),))
    if layer.getbbox() is None: return None
    shadow = layer.split()[3].filter(ImageFilter.GaussianBlur(10)).point(lambda v: int(v * 0.75))
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0)); out.putalpha(shadow)
    return Image.alpha_composite(out, layer)


# bottom gradient under lower-third headlines so white type reads over the light wall
grad = np.zeros((H, W, 1), np.float32)
g0, g1 = int(H * 0.52), int(H * 0.86)
grad[g0:g1, :, 0] = np.linspace(0, 0.55, g1 - g0)[:, None]; grad[g1:, :, 0] = 0.55

# ---------- render ----------
enc = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
       "-i", "-", "-i", R + "audio.mp3", "-map", "0:v", "-map", "1:a",
       "-af", f"atrim=0:{TOTAL},afade=t=out:st={TOTAL - 0.8:.2f}:d=0.8",
       "-c:v", "libx264", "-preset", "ultrafast" if PREVIEW else "slow", "-crf", "28" if PREVIEW else "17",
       "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", f"{TOTAL}",
       "/home/user/Cloud-/output/tee_reel" + ("_preview" if PREVIEW else "") + ".mp4"]
pipe = subprocess.Popen(enc, stdin=subprocess.PIPE)
for i, (name, tick, clip, t_in, speed, z0, z1, fx, fy, whip_in) in enumerate(SHOTS):
    f0, f1 = starts[i], starts[i + 1]
    n = f1 - f0
    whip_out = i + 1 < len(SHOTS) and SHOTS[i + 1][9]
    frames, zmax = decode(clip, t_in, speed, max(z0, z1), n)
    for j in range(n):
        g = f0 + j; t = g / FPS
        img = frame_at(frames[j], zmax, z0 + (z1 - z0) * j / max(n - 1, 1), fx, fy)
        a = np.asarray(img)
        # whip: outgoing shot smears left over its last frames, incoming arrives smeared and is sharp on the beat
        if whip_out and j >= n - (WHIP_PRE - 1):
            s = (j - (n - WHIP_PRE)) / WHIP_PRE
            a = hblur(np.roll(a, -int(260 * s), axis=1), int(160 * s))
        if whip_in and j == 0:
            a = hblur(np.roll(a, 220, axis=1), 140)
        a = a.astype(np.float32)
        if name == "endcard":   # darken the tee under the end card
            a *= 0.42
        a *= 1 - grad
        frame = Image.fromarray(a.clip(0, 255).astype(np.uint8))
        tl = text_layer(t)
        if tl is not None: frame = Image.alpha_composite(frame.convert("RGBA"), tl).convert("RGB")
        fade = min(1.0, (TOTAL - t) / 0.8)   # fade to black as the music ends
        if fade < 1: frame = Image.fromarray((np.asarray(frame) * fade).astype(np.uint8))
        pipe.stdin.write(frame.tobytes())
pipe.stdin.close(); pipe.wait()
print("wrote", enc[-1])
