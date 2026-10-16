#!/usr/bin/env python3
"""Recreate a reference edit shot-for-shot from raw clips, using ffmpeg.

    python3 -I project/edit.py                       # everything in ./project/input (auto-detected)
    python3 -I project/edit.py --drive <folder-url>  # download a Google Drive folder into ./project/input first
    python3 -I project/edit.py --auto                # ignore project/shot_plan.json and let the matcher pick footage
    python3 -I project/edit.py --cuts 1.45,3.6,...   # override the detected cut times (reference seconds)
    python3 -I project/edit.py --preview             # fast, low-quality render

Pipeline
  1. reference: ffprobe, cut detection (PySceneDetect content scores + local-peak test), transition type,
     frame cadence (-> slow-mo and animated zooms), zoom curves, end card, tonal look  -> project/cuts.json
  2. raw clips: 5 fps layout/motion descriptors, sharpness, blank frames (cached in project/cache)
  3. matching: every reference shot gets the raw window that looks and moves most alike, in story order
     (dynamic programming over 01 -> 02 -> 03). project/shot_plan.json, when present and made for the same
     clips, overrides the chosen in-points.
  4. render: shot durations scaled to exactly --duration seconds, reference fps/size, H.264 + silent AAC
  5. music (if input/music.* exists), compare.mp4, summary.md
"""
import argparse, importlib.util, json, shutil, subprocess, sys
from fractions import Fraction
from pathlib import Path

for _mod, _pkg in [("numpy", "numpy"), ("cv2", "opencv-python-headless"), ("scenedetect", "scenedetect"), ("PIL", "pillow")]:
    if importlib.util.find_spec(_mod) is None:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", _pkg], check=True)
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm"}
AUDIO_EXT = {".mp3", ".m4a", ".wav"}
FW, FH = 144, 256                  # analysis frame size (portrait); landscape footage is analysed squeezed
SAMPLE_FPS = 5                     # raw-clip analysis rate
CUT_MIN_PEAK, CUT_RATIO, MIN_SHOT = 10.0, 2.8, 0.3   # a cut = content peak >= 2.8x the median of the +-0.5 s around it
FLOW_WEIGHT = 0.25                 # weight of motion vs. layout similarity when matching shots
GRADE_STRENGTH = 0.75              # how far to pull the raw tonal curve towards the reference (0 = off)
ZOOM_BLUR = (2.2, 1.8)             # zoom-blur transition: outgoing shot zooms to x2.2, incoming starts at x1.8
END_CARD_LINES = ["WhatsApp", "7810024217"]          # text can't be read from pixels: one entry per text row
CARD_FONTS = ["/usr/share/fonts/opentype/inter/InterDisplay-Black.otf", "/usr/share/fonts/opentype/inter/Inter-Black.otf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
LABEL_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


# ---------------------------------------------------------------- helpers
def run(cmd, binary=False):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=not binary)
    if r.returncode:
        err = r.stderr if not binary else r.stderr.decode(errors="replace")
        sys.exit(f"command failed: {' '.join(map(str, cmd))[:400]}\n{err[-3000:]}")
    return r.stdout


def ensure_ffmpeg():
    if shutil.which("ffmpeg") and shutil.which("ffprobe"):
        return
    if shutil.which("apt-get"):
        subprocess.run(["apt-get", "update", "-qq"], check=False)
        subprocess.run(["apt-get", "install", "-y", "-qq", "ffmpeg"], check=True)
    elif shutil.which("brew"):
        subprocess.run(["brew", "install", "ffmpeg"], check=True)
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg is not installed and could not be installed automatically")


def download(url, dest):
    if importlib.util.find_spec("gdown") is None:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "gdown"], check=True)
    import gdown
    dest.mkdir(parents=True, exist_ok=True)
    try:
        files = gdown.download_folder(url, output=str(dest), quiet=False)
    except Exception as e:  # gdown raises for private folders / quota errors
        files = None
        print(e)
    if not files:
        sys.exit("Google Drive download failed - is the folder shared as 'Anyone with the link'?")


def probe(path):
    j = json.loads(run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,r_frame_rate,avg_frame_rate:stream_side_data=rotation:format=duration",
                        "-of", "json", path]))
    s = j["streams"][0]
    w, h = s["width"], s["height"]
    if any(abs(int(sd.get("rotation", 0))) % 180 == 90 for sd in s.get("side_data_list", [])):
        w, h = h, w
    fr = Fraction(s["r_frame_rate"])
    avg = Fraction(s["avg_frame_rate"]) if s["avg_frame_rate"] != "0/0" else fr
    g = np.gcd(w, h)
    return dict(file=str(path), width=w, height=h, aspect=f"{w // g}:{h // g}", fps=round(float(fr), 3),
                avg_fps=round(float(avg), 3), vfr=abs(float(fr) - float(avg)) > 0.5, duration=float(j["format"]["duration"]))


def frames(path, vf, w, h, gray=False, pre=()):
    """Stream decoded frames (first video stream) through a filter chain, without retiming."""
    cmd = ["ffmpeg", "-v", "error", *pre, "-i", str(path), "-map", "0:v:0", "-vf", vf, "-fps_mode", "passthrough",
           "-f", "rawvideo", "-pix_fmt", "gray" if gray else "bgr24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    n = w * h * (1 if gray else 3)
    while (b := p.stdout.read(n)) and len(b) == n:
        yield np.frombuffer(b, np.uint8).reshape((h, w) if gray else (h, w, 3))
    p.wait()


def grab_frame(path, t, w, h):
    raw = run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", path, "-map", "0:v:0", "-frames:v", "1", "-vf", f"scale={w}:{h}",
               "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], binary=True)
    return np.frombuffer(raw, np.uint8).reshape(h, w, 3)


def frame_times(path):
    out = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time", "-of", "csv=p=0", path])
    t = np.array(sorted(float(x.strip(",")) for x in out.split() if x.strip(",") not in ("", "N/A")))
    return t - t[0]


def hog(g, cell=16, nb=9):
    g = g.astype(np.float32)
    gx, gy = cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1)
    mag, b = np.hypot(gx, gy), np.minimum(((np.arctan2(gy, gx) % np.pi) / np.pi * nb).astype(int), nb - 1)
    h, w = g.shape
    cy, cx = h // cell, w // cell
    out = np.zeros(cy * cx * nb, np.float32)
    idx = ((np.minimum(np.arange(h) // cell, cy - 1)[:, None] * cx + np.minimum(np.arange(w) // cell, cx - 1)[None, :]) * nb + b)
    np.add.at(out, idx.ravel(), mag.ravel())
    out = out.reshape(cy * cx, nb)
    return (out / (np.linalg.norm(out, axis=1, keepdims=True) + 1e-3)).ravel()


def frame_feat(bgr):
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    t = cv2.resize(cv2.GaussianBlur(g, (9, 9), 0), (18, 32), interpolation=cv2.INTER_AREA).astype(np.float32).ravel()
    hist = np.histogram(g, 16, (0, 256))[0].astype(np.float32)
    h = hog(cv2.GaussianBlur(g, (3, 3), 0))
    return dict(hog=h / (np.linalg.norm(h) + 1e-6), thumb=(t - t.mean()) / (t.std() + 1e-6) / np.sqrt(t.size), hist=hist / hist.sum(),
                grid=cv2.resize(g, (3, 5), interpolation=cv2.INTER_AREA).astype(np.float32).ravel() / 255,
                lap=cv2.Laplacian(g, cv2.CV_32F).var(), sd=g.std(), luma=g.mean(),
                small=cv2.resize(g, (72, 128), interpolation=cv2.INTER_AREA))


def flow(a, b):
    f = cv2.calcOpticalFlowFarneback(a, b, None, 0.5, 3, 13, 3, 5, 1.1, 0)
    return cv2.resize(f, (3, 5), interpolation=cv2.INTER_AREA).ravel(), f.reshape(-1, 2).mean(0)


def analyze_video(path, fps=None):
    """Per-frame descriptors (cached). fps=None keeps the native frames (used for the reference)."""
    st = Path(path).stat()
    cache = ROOT / "cache" / f"{Path(path).stem}_{st.st_size}_{int(st.st_mtime)}_{fps or 'native'}.npz"
    if cache.exists():
        return dict(np.load(cache))
    print(f"  decoding {Path(path).name} ...", flush=True)
    vf = (f"fps={fps}," if fps else "") + f"scale={FW}:{FH}:flags=area"
    rows = [frame_feat(f) for f in frames(path, vf, FW, FH)]
    d = {k: np.stack([r[k] for r in rows]) for k in rows[0]}
    if fps:  # motion between consecutive samples
        fl = [flow(a, b) for a, b in zip(d["small"], d["small"][1:])] or [(np.zeros(30), np.zeros(2))]
        fl.append(fl[-1])
        d["flow"] = np.stack([f[0] for f in fl])
        gm = np.stack([f[1] for f in fl])
        d["jitter"] = np.r_[0, np.linalg.norm(np.diff(gm, axis=0), axis=1)]
    cache.parent.mkdir(exist_ok=True)
    np.savez(cache, **d)
    return d


# ---------------------------------------------------------------- reference analysis
def detect_cuts(ref, info, feats, times):
    from scenedetect import open_video, SceneManager, ContentDetector, StatsManager
    # Constant-frame-rate proxy: OpenCV numbers the frames of a variable-frame-rate file by pts x average fps,
    # so frames collide and lose their scores. On the proxy frame i is exactly i/fps; repeats score 0.
    fps = info["fps"] if info["fps"] <= 120 else round(info["avg_fps"])
    st = Path(ref).stat()
    proxy = ROOT / "cache" / f"{Path(ref).stem}_{st.st_size}_cfr{fps:g}.avi"
    if not proxy.exists():
        proxy.parent.mkdir(exist_ok=True)
        run(["ffmpeg", "-y", "-v", "error", "-i", ref, "-map", "0:v:0", "-vf", f"fps={fps},scale=270:480", "-c:v", "mjpeg", "-q:v", "3", proxy])
    v = open_video(str(proxy), backend="opencv")
    stats = StatsManager()
    sm = SceneManager(stats)
    sm.add_detector(ContentDetector(threshold=CUT_MIN_PEAK, min_scene_len=1))
    sm.detect_scenes(v)
    n, duration = v.frame_number, info["duration"]
    c = np.array([stats.get_metrics(i, ["content_val"])[0] if stats.metrics_exist(i, ["content_val"]) else 0.0 for i in range(n)], float)
    t = np.arange(n) / fps
    nz = c > 0.5                     # ~0 rows are repeated frames (lossy CFR files repeat frames at 0.1-0.3)
    cand = []
    for i in range(1, n):
        if c[i] < CUT_MIN_PEAK or c[i] < c[max(0, i - 4):i + 5].max() or not 0.15 < t[i] < duration - 0.15:
            continue
        win = nz & (np.abs(t - t[i]) <= 0.5) & (np.abs(t - t[i]) > 0.1)
        med = max(np.median(c[win]) if win.any() else 1.0, 1.0)
        cand.append(dict(time=round(t[i], 3), score=round(c[i], 1), ratio=round(c[i] / med, 2), med=med, i=i))
    cuts, rejected = [], []
    for x in sorted(cand, key=lambda x: -x["ratio"]):
        if x["ratio"] >= CUT_RATIO and all(abs(x["time"] - y["time"]) >= MIN_SHOT for y in cuts):
            cuts.append(x)
        else:
            rejected.append({k: x[k] for k in ("time", "score", "ratio")})
    cuts.sort(key=lambda x: x["time"])
    # transition type: gradual (elevated change on both sides) -> fade (luma dip) / zoom (blur) / dissolve
    lum, lap = feats["luma"], feats["lap"]
    for x in cuts:
        i, m, tc = x["i"], x["med"], x["time"]
        side = lambda lo, hi: int((nz & (t > lo) & (t < hi) & (c > 1.5 * m)).sum())
        before, after = side(tc - 0.13, tc), side(tc, tc + 0.13)
        kind, dur = "cut", 0.0
        if before >= 2 and after >= 2:
            j = i
            while j > 0 and c[j - 1] > 1.5 * m and t[i] - t[j - 1] < 0.4: j -= 1
            k = i
            while k + 1 < n and c[k + 1] > 1.5 * m and t[k + 1] - t[i] < 0.4: k += 1
            dur = round(min(max(t[k] - t[j] + 2 / fps, 0.1), 0.6), 3)
            near = np.abs(times - tc) <= 0.15
            far = lambda lo, hi: (times > tc + lo) & (times < tc + hi)
            ctx_l = min(np.median(lum[far(-0.6, -0.2)]), np.median(lum[far(0.2, 0.6)]))
            ctx_s = min(np.median(lap[far(-0.6, -0.2)]), np.median(lap[far(0.2, 0.6)]))
            kind = ("fade" if lum[near].min() < 0.5 * ctx_l and lum[near].min() < 40 else
                    "zoom" if lap[near].min() < 0.4 * ctx_s else "dissolve")
        x.update(transition=kind, transition_duration=dur)
        del x["i"], x["med"]
    return cuts, sorted(rejected, key=lambda x: x["time"])


def orb_scale(a, b, orb, bf):
    ka, da = orb.detectAndCompute(a, None)
    kb, db = orb.detectAndCompute(b, None)
    if da is None or db is None or len(ka) < 20 or len(kb) < 20:
        return None
    m = bf.match(da, db)
    if len(m) < 20:
        return None
    pa = np.float32([ka[x.queryIdx].pt for x in m])
    pb = np.float32([kb[x.trainIdx].pt for x in m])
    M, inl = cv2.estimateAffinePartial2D(pa, pb, method=cv2.RANSAC, ransacReprojThreshold=2.5)
    if M is None or inl.sum() < 15:
        return None
    return float(np.hypot(M[0, 0], M[1, 0])), M


def zoom_curve(ref, times, s, e):
    """Digital zoom inside a shot, measured by chaining ORB similarity transforms. -> [(u, zoom)], anchor"""
    W, H = 540, 960
    sel = times[(times >= s - 1e-4) & (times < e - 1e-4)]
    imgs = list(frames(ref, f"scale={W}:{H}", W, H, gray=True, pre=["-ss", f"{s:.4f}", "-t", f"{e - s:.4f}"]))
    k = min(len(sel), len(imgs))
    if k < 6:
        return None, (0.5, 0.5)
    sel, imgs = sel[:k], imgs[:k]
    step = max(1, int(round(k / (e - s) / 15)))
    idx = list(range(0, k, step))
    orb, bf = cv2.ORB_create(3000), cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    acc, curve = 1.0, [(0.0, 1.0)]
    for a, b in zip(idx, idx[1:]):
        r = orb_scale(imgs[a], imgs[b], orb, bf)
        acc *= r[0] if r and 0.8 < r[0] < 1.25 else 1.0
        curve.append(((sel[b] - s) / (e - s), acc))
    z = np.array([c[1] for c in curve])
    z = np.convolve(np.r_[z[0], z, z[-1]], np.ones(3) / 3, "valid") / z.min()
    if z.max() / z.min() < 1.03:
        return None, (0.5, 0.5)
    anchor = (0.5, 0.5)
    r = orb_scale(imgs[0], imgs[idx[int(np.argmax(z))]], orb, bf)
    if r and abs(r[0] - 1) > 0.08:  # fixed point of the similarity transform
        p = np.linalg.solve(np.eye(2) - r[1][:, :2], r[1][:, 2])
        anchor = (float(np.clip(p[0] / W, 0.3, 0.7)), float(np.clip(p[1] / H, 0.3, 0.7)))
    keys = [(round(u, 4), round(float(v), 4)) for (u, _), v in zip(curve, z)]
    return keys, anchor


def text_card(ref, t0, t1, info):
    """Measure the text rows of a dark title card (first and last frame) -> rows, scale animation."""
    W, H = info["width"], info["height"]
    a, b = grab_frame(ref, t0 + 0.03, W, H), grab_frame(ref, max(t0, t1 - 0.05), W, H)
    def rows(img):
        m = img.max(axis=2) > 80
        ys = np.where(m.any(axis=1))[0]
        if len(ys) == 0:
            return []
        groups, cur = [], [ys[0]]
        for y in ys[1:]:
            if y - cur[-1] > 8:
                groups.append(cur)
                cur = []
            cur.append(y)
        groups.append(cur)
        out = []
        for g in groups:
            band = m[g[0]:g[-1] + 1]
            xs = np.where(band.any(axis=0))[0]
            col = np.median(img[g[0]:g[-1] + 1][band], axis=0).astype(int)
            out.append(dict(box=[int(xs[0]), int(g[0]), int(xs[-1]), int(g[-1])], color="#%02X%02X%02X" % tuple(col)))
        return out
    ra, rb = rows(a), rows(b)
    card = dict(rows=ra, scale_end=1.0, anchor=[0.5, 0.5])
    if ra and rb:
        A = np.array([r["box"] for r in ra])
        B = np.array([r["box"] for r in rb])
        (ax0, ay0), (ax1, ay1) = A[:, :2].min(0), A[:, 2:].max(0)
        (bx0, by0), (bx1, by1) = B[:, :2].min(0), B[:, 2:].max(0)
        s = ((bx1 - bx0) / max(ax1 - ax0, 1) + (by1 - by0) / max(ay1 - ay0, 1)) / 2
        if abs(s - 1) > 0.02:
            fx = (bx0 - s * ax0) / (1 - s)
            fy = (by0 - s * ay0) / (1 - s)
            card.update(scale_end=round(float(s), 3), anchor=[round(float(np.clip(fx / W, 0, 1)), 3), round(float(np.clip(fy / H, 0, 1)), 3)])
    return card


def analyze_reference(ref, info, override_cuts, target):
    feats = analyze_video(ref)
    times = frame_times(ref)
    n = min(len(times), len(feats["luma"]))
    times = times[:n]
    feats = {k: v[:n] for k, v in feats.items()}
    print("  detecting cuts ...", flush=True)
    cuts, rejected = detect_cuts(ref, info, feats, times)
    if override_cuts:
        cuts = [dict(time=t, score=None, ratio=None, transition="cut", transition_duration=0.0) for t in override_cuts]
    small = feats["small"].astype(np.int16)
    dup = np.r_[False, np.abs(np.diff(small, axis=0)).mean(axis=(1, 2)) < 0.02]   # identical = repeated frame
    uniq = times if info["vfr"] else times[~dup]   # a VFR file only stores frames that were rendered
    bounds = [0.0] + [c["time"] for c in cuts] + [info["duration"]]
    shots = []
    for k, (s, e) in enumerate(zip(bounds, bounds[1:])):
        pin = cuts[k - 1]["transition_duration"] / 2 if k > 0 else 0
        pout = cuts[k]["transition_duration"] / 2 if k < len(cuts) else 0
        a, b = s + max(0.1, pin + 0.06), e - max(0.1, pout + 0.06)
        if b - a < 0.2:
            a, b = s, e
        sel = (times >= s) & (times < e)
        mid = feats["small"][np.where(sel)[0][len(np.where(sel)[0]) // 2]]
        is_card = (mid < 25).mean() > 0.9 and (mid > 100).mean() > 0.0005
        u = uniq[(uniq >= a) & (uniq < b)]
        peak = max([((u >= x) & (u < x + 0.4)).sum() / 0.4 for x in u if x + 0.4 <= b] or [len(u) / (b - a)])
        shots.append(dict(shot=k + 1, start=round(float(s), 3), end=round(float(e), 3), duration=round(float(e - s), 3),
                          kind="text_card" if is_card else "footage",
                          transition_in=cuts[k - 1]["transition"] if k > 0 else "start",
                          transition_in_duration=float(cuts[k - 1]["transition_duration"]) if k > 0 else 0.0,
                          unique_fps=round(float(len(u) / (b - a)), 1), peak_unique_fps=round(float(peak), 1)))
    foot = [x for x in shots if x["kind"] == "footage"]
    still = [x["unique_fps"] for x in foot if x["unique_fps"] < 0.85 * info["fps"]]
    normal = float(np.median(still)) if still else info["fps"]
    for x in shots:
        animated = info["fps"] >= 1.4 * normal and x["peak_unique_fps"] >= 0.85 * info["fps"]
        r = x["unique_fps"] / normal
        x.update(animated=bool(animated), speed=1.0 if animated or r >= 0.9 or x["kind"] != "footage" else max(0.25, round(r * 20) / 20),
                 zoom=None, zoom_anchor=[0.5, 0.5])
        if animated and x["kind"] == "footage":
            x["zoom"], x["zoom_anchor"] = zoom_curve(ref, times, x["start"], x["end"])
        if x["kind"] == "text_card":
            x["card"] = text_card(ref, x["start"], x["end"], info)
    k = target / info["duration"]
    for x in shots:
        x.update(out_start=round(x["start"] * k, 3), out_end=round(x["end"] * k, 3), out_duration=round(x["duration"] * k, 3))
    # tonal look of the reference footage (luma percentiles, used for grading after matching)
    ok = np.zeros(n, bool)
    for x in foot:
        ok |= (times >= x["start"] + 0.1) & (times < x["end"] - 0.1)
    return dict(cuts=cuts, rejected=rejected, shots=shots, normal_fps=round(normal, 2), feats=feats, times=times, look_mask=ok)


# ---------------------------------------------------------------- matching
def sim_matrix(R, idx, C):
    s_h = R["hog"][idx] @ C["hog"].T
    s_t = R["thumb"][idx] @ C["thumb"].T
    s_hist = np.minimum(R["hist"][idx][:, None, :], C["hist"][None]).sum(-1)
    s_grid = 1 - np.abs(R["grid"][idx][:, None, :] - C["grid"][None]).mean(-1) * 3
    return 0.3 * s_h + 0.3 * s_t + 0.2 * s_hist + 0.2 * s_grid


def flow_sim(A, B):
    na, nb = np.linalg.norm(A, axis=1, keepdims=True), np.linalg.norm(B, axis=1, keepdims=True)
    cos = (A @ B.T) / (na * nb.T + 1e-6)
    w = np.minimum(na, nb.T) / (np.maximum(na, nb.T) + 1e-6)
    return np.where((na < 0.3) & (nb.T < 0.3), 0.6, 0.5 * cos * np.sqrt(w) + 0.5 * w)


def match(ref_an, clips, raw, fps, ordered=True):
    R, times = ref_an["feats"], ref_an["times"]
    shots = [x for x in ref_an["shots"] if x["kind"] == "footage"]
    names = list(clips)
    off, G = {}, 0
    for c in names:
        off[c] = G
        G += len(raw[c]["luma"]) + 1
    NEG = -1e9
    table = []
    for x in shots:
        s, e = x["start"] + 0.1, x["end"] - 0.1
        ts = np.arange(s, max(e, s + 0.01), 0.1)
        ri = np.clip(np.searchsorted(times, ts), 0, len(times) - 1)
        rj = np.clip(np.searchsorted(times, ts + 0.2), 0, len(times) - 1)
        rflow = np.stack([flow(R["small"][a], R["small"][b])[0] for a, b in zip(ri, rj)]) / x["speed"]
        L = int(np.ceil(x["out_duration"] * x["speed"] * SAMPLE_FPS))
        sc = np.full(G, NEG)
        for c in names:
            C = raw[c]
            S = (1 - FLOW_WEIGHT) * sim_matrix(R, ri, C) + FLOW_WEIGHT * flow_sim(rflow, C["flow"])
            lap = C["lap"]
            q = 0.05 * np.clip(np.log(lap / np.median(lap)), -1, 0.5) - 0.5 * (C["sd"] < 14) - 0.02 * np.clip(C["jitter"] / 2, 0, 2)
            nC = S.shape[1]
            for p in range(0, nC - L):
                cols = np.clip((p + (np.arange(len(ri)) + 0.5) / len(ri) * L).astype(int), 0, nC - 1)
                sc[off[c] + p] = S[np.arange(len(ri)), cols].mean() + q[p:p + L].mean()
        table.append((sc, L))
    if ordered:  # best monotonic, non-overlapping path through the clips (story order)
        V, back = table[0][0].copy(), []
        for k in range(1, len(table)):
            Lp, sc = table[k - 1][1], table[k][0]
            arg = np.zeros(G, int)
            best = 0
            for i in range(G):
                if V[i] >= V[best]:
                    best = i
                arg[i] = best
            pm = V[arg]
            Vn, bk = np.full(G, NEG), np.zeros(G, int)
            g = np.arange(G)
            okk = (g - Lp >= 0) & (sc > NEG / 2)
            j = np.clip(g - Lp, 0, G - 1)
            okk &= pm[j] > NEG / 2
            Vn[okk] = sc[okk] + pm[j][okk]
            bk[okk] = arg[j][okk]
            back.append(bk)
            V = Vn
        g = int(np.argmax(V))
        path = [g]
        for bk in reversed(back):
            g = int(bk[g])
            path.append(g)
        path = path[::-1]
    else:
        path = [int(np.argmax(sc)) for sc, _ in table]
    plan = {}
    for x, g, (sc, _) in zip(shots, path, table):
        c = [c for c in names if off[c] <= g][-1]
        plan[x["shot"]] = dict(clip=c, start=round((g - off[c]) / SAMPLE_FPS, 2), score=round(float(sc[g]), 3))
    return plan


def tone_curve(ref_an, raw, chosen, strength):
    P = [1, 5, 10, 25, 50, 75, 90, 95, 99]
    R, m = ref_an["feats"]["small"], ref_an["look_mask"]
    ref_px = np.concatenate([f[::2, ::2].ravel() for f in R[m][:: max(1, m.sum() // 400)]])
    raw_px = []
    for c, a, b in chosen:
        sm = raw[c]["small"][int(a * SAMPLE_FPS):int(np.ceil(b * SAMPLE_FPS)) + 1]
        raw_px += [f[::2, ::2].ravel() for f in sm]
    raw_px = np.concatenate(raw_px)
    pr, pw = np.percentile(ref_px, P) / 255, np.percentile(raw_px, P) / 255
    pts, last_x, last_y = [(0.0, 0.0)], 0.0, 0.0
    for x, y in zip(pw, pr):
        y = x + strength * (y - x)
        if x > last_x + 0.01 and y > last_y:
            pts.append((float(x), float(y)))
            last_x, last_y = x, y
    pts.append((1.0, 1.0))
    return pts


# ---------------------------------------------------------------- rendering
def pw_linear(keys, var):
    expr = f"{keys[-1][1]:.4f}"
    for (t0, z0), (t1, z1) in reversed(list(zip(keys, keys[1:]))):
        if t1 - t0 > 1e-4:
            expr = f"if(lt({var},{t1:.4f}),{z0:.4f}+({z1 - z0:.4f})*({var}-{t0:.4f})/{t1 - t0:.4f},{expr})"
    return expr


def fit_crop(sw, sh, W, H):
    """Crop to the output aspect ratio (fill the frame, no black bars)."""
    if abs(sw / sh - W / H) < 0.01:
        return ""
    if sw / sh > W / H:
        return f"crop={int(sh * W / H) // 2 * 2}:{sh},"
    return f"crop={sw}:{int(sw * H / W) // 2 * 2},"


def end_card_png(card, W, H, path):
    S = 2
    img = Image.new("RGB", (W * S, H * S), "black")
    d = ImageDraw.Draw(img)
    font_path = next((f for f in CARD_FONTS if Path(f).exists()), None)
    rows = card["rows"] or [dict(box=[int(W * .3), int(H * .45), int(W * .7), int(H * .5)], color="#FFFFFF")]
    lines = END_CARD_LINES[:len(rows)] if len(END_CARD_LINES) >= len(rows) else END_CARD_LINES + [""] * (len(rows) - len(END_CARD_LINES))
    for text, r in zip(lines, rows):
        if not text:
            continue
        x0, y0, x1, y1 = [v * S for v in r["box"]]
        f = ImageFont.truetype(font_path, 400) if font_path else ImageFont.load_default()
        bb = d.textbbox((0, 0), text, font=f)
        glyph = Image.new("L", (bb[2] - bb[0] + 4, bb[3] - bb[1] + 4), 0)
        ImageDraw.Draw(glyph).text((2 - bb[0], 2 - bb[1]), text, font=f, fill=255)
        h = y1 - y0 + 1
        w = min(int(glyph.width * h / glyph.height), x1 - x0 + 1) if x1 - x0 > 0 else int(glyph.width * h / glyph.height)
        w = max(w, int(glyph.width * h / glyph.height * 0.6))   # condense to the reference width, at most to 60 %
        glyph = glyph.resize((w, h), Image.LANCZOS)
        cx = (x0 + x1) // 2
        img.paste(Image.new("RGB", glyph.size, r["color"]), (cx - w // 2, y0), glyph)
    img.save(path)


def build_edit(ref_an, info, plan, clips, clip_info, music, args, curve):
    W, H, FPS = info["width"], info["height"], args.fps or (info["fps"] if info["fps"] <= 120 else round(info["avg_fps"]))
    FPS = int(FPS) if float(FPS).is_integer() else FPS
    total = int(round(args.duration * FPS))
    shots = ref_an["shots"]
    k = args.duration / info["duration"]
    edges = [int(round(x["start"] * k * FPS)) for x in shots] + [total]
    edges[0] = 0
    curves = "curves=master='" + " ".join(f"{x:.3f}/{y:.3f}" for x, y in curve) + "'," if curve else ""
    inputs, chains, rows = [], [], []
    for n, x in enumerate(shots):
        N = edges[n + 1] - edges[n]
        D = N / FPS
        nxt = shots[n + 1] if n + 1 < len(shots) else None
        t_in = x["transition_in"] if n > 0 else "start"
        h_in = x["transition_in_duration"] * k / 2
        t_out = nxt["transition_in"] if nxt else "end"
        h_out = nxt["transition_in_duration"] * k / 2 if nxt else 0
        T = f"(on/{FPS})"
        if x["kind"] == "text_card":
            png = ROOT / "cache" / "end_card.png"
            end_card_png(x["card"], W, H, png)
            c = x["card"]
            inputs += ["-loop", "1", "-framerate", str(FPS), "-t", f"{D + 0.5:.3f}", "-i", png]
            z = f"1+({c['scale_end'] - 1:.4f})*{T}/{D:.4f}"
            chains.append(f"[{{IDX}}:v]format=gbrp,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,"
                          f"zoompan=z='{z}':x='{c['anchor'][0]}*iw*(1-1/zoom)':y='{c['anchor'][1]}*ih*(1-1/zoom)':d=1:s={W}x{H}:fps={FPS},"
                          f"trim=end_frame={N},setpts=PTS-STARTPTS,setsar=1,format=yuv420p")
            rows.append(dict(shot=x["shot"], out=(edges[n] / FPS, edges[n + 1] / FPS), source="end card (generated)", effects=f"text scale x1.00->x{c['scale_end']:.2f}"))
            continue
        p = plan[x["shot"]]
        ci = clip_info[p["clip"]]
        speed = x["speed"]
        src_len = D * speed
        start = min(max(0.0, p["start"]), max(0.0, ci["duration"] - src_len - 0.08))
        inputs += ["-ss", f"{start:.3f}", "-t", f"{src_len + 0.6:.3f}", "-i", clips[p["clip"]]]
        zparts, effects = [], []
        if x["zoom"]:
            keys = [(u * D, z) for u, z in x["zoom"]]
            zparts.append(pw_linear(keys, T))
            effects.append(f"digital zoom x1.00->x{max(z for _, z in x['zoom']):.2f}")
        if t_in == "zoom" and h_in > 0:
            zparts.append(f"(1+{ZOOM_BLUR[1] - 1}*pow(1-min({T}/{h_in:.4f},1),2))")
            effects.append("zoom-blur in")
        if t_out == "zoom" and h_out > 0:
            zparts.append(f"(1+{ZOOM_BLUR[0] - 1}*pow(max({T}-{D - h_out:.4f},0)/{h_out:.4f},2))")
            effects.append("zoom-blur out")
        if speed != 1:
            effects.insert(0, f"speed x{speed:g}")
        ax, ay = x["zoom_anchor"]
        zp = lambda z: f"zoompan=z='{z}':x='{ax:.3f}*iw*(1-1/zoom)':y='{ay:.3f}*ih*(1-1/zoom)':d=1:s={W}x{H}:fps={FPS}"
        blur = []  # radial-blur spread during zoom-blur transitions, 0 elsewhere
        if t_in == "zoom" and h_in > 0:
            blur.append(f"0.025*max(1-{T}/{h_in:.4f},0)")
        if t_out == "zoom" and h_out > 0:
            blur.append(f"0.025*max({T}-{D - h_out:.4f},0)/{h_out:.4f}")
        fades = ""
        if t_in in ("fade", "dissolve") and h_in > 0:
            fades += f",fade=t=in:st=0:d={h_in:.4f}"
        if t_out in ("fade", "dissolve") and h_out > 0:
            fades += f",fade=t=out:st={D - h_out:.4f}:d={h_out:.4f}"
        pre = (f"[{{IDX}}:v:0]setpts=PTS-STARTPTS" + (f",setpts=PTS/{speed}" if speed != 1 else "") +
               f",fps={FPS},tpad=stop_mode=clone:stop_duration=1,trim=end_frame={N},setpts=PTS-STARTPTS,"
               + fit_crop(ci["width"], ci["height"], W, H))
        post = curves + f"format=yuv420p,setsar=1{fades}"
        Z = "*".join(zparts)
        if blur:  # radial blur = average of copies zoomed slightly further each (frame-synchronous, keeps frame count)
            taps, B = 8, "+".join(blur)
            chains.append(pre + f"split={taps}" + "".join(f"[b{{IDX}}_{i}]" for i in range(taps)) + ";"
                          + ";".join(f"[b{{IDX}}_{i}]" + zp(f"({Z})*(1+{i}*({B}))") + f"[z{{IDX}}_{i}]" for i in range(taps)) + ";"
                          + "".join(f"[z{{IDX}}_{i}]" for i in range(taps)) + f"mix=inputs={taps}," + post)
        else:
            chains.append(pre + (zp(Z) if zparts else f"scale={W}:{H}:flags=lanczos") + "," + post)
        rows.append(dict(shot=x["shot"], out=(edges[n] / FPS, edges[n + 1] / FPS), source=p["clip"], src=(start, start + src_len),
                         effects=", ".join(effects) or "-", score=p.get("score"), manual=p.get("manual", False)))
    # assign input indexes
    idx, fc = 0, []
    for ch in chains:
        fc.append(ch.replace("{IDX}", str(idx)) + f"[v{idx}]")
        idx += 1
    fc.append("".join(f"[v{i}]" for i in range(idx)) + f"concat=n={idx}:v=1:a=0,format=yuv420p[vout]")
    out_dir = ROOT / "output"
    out_dir.mkdir(exist_ok=True)
    out_a = out_dir / "final_no_music.mp4"
    enc = ["-c:v", "libx264", "-preset", "ultrafast" if args.preview else "slow", "-crf", "28" if args.preview else "18",
           "-pix_fmt", "yuv420p", "-r", str(FPS), "-frames:v", str(total),
           "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-movflags", "+faststart"]
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-stats", *inputs,
           "-f", "lavfi", "-t", f"{args.duration}", "-i", "anullsrc=r=48000:cl=stereo",
           "-filter_complex", ";".join(fc), "-map", "[vout]", "-map", f"{idx}:a", "-map_metadata", "-1", *enc,
           "-c:a", "aac", "-b:a", "128k", "-t", f"{args.duration}", out_a]
    (ROOT / "cache" / "render_cmd.txt").write_text(" ".join(f"'{c}'" if " " in str(c) or ";" in str(c) else str(c) for c in cmd))
    print(f"  rendering {out_a.relative_to(ROOT.parent)} ({total} frames @ {FPS} fps) ...", flush=True)
    subprocess.run([str(c) for c in cmd], check=True)
    outs = [out_a]
    if music:
        outs.append(mix_music(out_a, music, args.duration, out_dir / "final_with_music.mp4"))
    return rows, outs, FPS, edges


def mix_music(video, music, dur, out):
    chain = (f"atrim=0:{dur},asetpts=N/SR/TB,aformat=sample_rates=48000:channel_layouts=stereo,"
             f"afade=t=in:st=0:d=0.5,afade=t=out:st={dur - 1.5}:d=1.5")
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-stream_loop", "-1", "-i", str(music), "-af",
                        chain + ",loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True)
    m = json.loads(r.stderr[r.stderr.rindex("{"):r.stderr.rindex("}") + 1])
    ln = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
          f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", video, "-stream_loop", "-1", "-i", music,
         "-filter_complex", f"[1:a]{chain},{ln},aresample=48000[a]", "-map", "0:v", "-map", "[a]", "-map_metadata", "-1", "-c:v", "copy",
         "-c:a", "aac", "-b:a", "192k", "-t", f"{dur}", "-movflags", "+faststart", out])
    return out


def compare_video(ref, info, edit, shots, FPS, edges, out):
    k = (edges[-1] / FPS) / info["duration"]
    f = LABEL_FONT
    bars = []
    for n, x in enumerate(shots):
        a, b = edges[n] / FPS, edges[n + 1] / FPS
        col = ["0xE8A33D", "0x3D8BE8"][n % 2]
        bars.append(f"drawbox=x=0:y=ih-40:w=iw:h=40:color={col}:t=fill:enable='between(t,{a:.3f},{b - 1e-3:.3f})'")
        bars.append(f"drawtext=fontfile={f}:text='SHOT {x['shot']}':x=12:y=h-32:fontsize=24:fontcolor=white:enable='between(t,{a:.3f},{b - 1e-3:.3f})'")
    lab = lambda t: f"drawtext=fontfile={f}:text='{t}':x=(w-tw)/2:y=14:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8"
    fc = (f"[0:v]setpts=PTS*{k:.6f},fps={FPS},scale=540:960,setsar=1,{lab(f'REFERENCE (stretched x{k:.4f})')}[a];"
          f"[1:v]scale=540:960,setsar=1,{lab('MY EDIT')}[b];"
          f"[a][b]hstack=inputs=2,{','.join(bars)},"
          f"drawtext=fontfile={f}:text='%{{pts\\:hms}}':x=w-tw-12:y=h-32:fontsize=24:fontcolor=white,format=yuv420p[v]")
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", ref, "-i", edit, "-f", "lavfi", "-t", f"{edges[-1] / FPS}",
         "-i", "anullsrc=r=48000:cl=stereo", "-filter_complex", fc, "-map", "[v]", "-map", "2:a", "-map_metadata", "-1",
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-frames:v", str(edges[-1]), "-c:a", "aac", "-b:a", "64k",
         "-t", f"{edges[-1] / FPS}", "-movflags", "+faststart", out])


def match_sheet(ref, edit, shots, info, FPS, edges, out):
    """Middle frame of every reference shot (top) next to the same shot in the edit (bottom)."""
    k = (edges[-1] / FPS) / info["duration"]
    tiles = []
    for n, x in enumerate(shots):
        t_ref = (x["start"] + x["end"]) / 2
        t_out = (edges[n] + edges[n + 1]) / 2 / FPS
        pair = []
        for src, t in ((ref, t_ref), (edit, t_out)):
            pair.append(Image.fromarray(grab_frame(src, t, 180, 320)))
        tiles.append(pair)
    sheet = Image.new("RGB", (180 * len(tiles), 640 + 30), "black")
    d = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(LABEL_FONT, 16)
    for i, (a, b) in enumerate(tiles):
        sheet.paste(a, (i * 180, 0))
        sheet.paste(b, (i * 180, 320))
        d.text((i * 180 + 6, 645), f"shot {shots[i]['shot']}", fill="yellow", font=font)
    sheet.save(out, quality=90)


def verify(paths, target):
    print("\nVerification (ffprobe):")
    ok = True
    for p in paths:
        j = json.loads(run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,duration,pix_fmt",
                            "-of", "json", p]))
        d = float(j["format"]["duration"])
        v = [s for s in j["streams"] if s["codec_type"] == "video"][0]
        a = [s for s in j["streams"] if s["codec_type"] == "audio"]
        ok &= abs(d - target) < 0.005 if "compare" not in str(p) else True
        print(f"  {Path(p).name:24s} duration={d:.3f}s  video={v['codec_name']} {v['width']}x{v['height']} {v['pix_fmt']} "
              f"{v['r_frame_rate']} fps, {v.get('nb_frames')} frames  audio={a[0]['codec_name'] if a else 'none'}")
    return ok


# ---------------------------------------------------------------- main
def find_inputs(inp, args):
    vids = sorted(p for p in inp.rglob("*") if p.suffix.lower() in VIDEO_EXT and p.is_file())
    ref = Path(args.reference) if args.reference else next((p for p in vids if "ref" in p.stem.lower()), None)
    if not ref:
        sys.exit(f"no reference video (file name containing 'reference') in {inp}")
    clips = [Path(c) for c in args.clips] if args.clips else [p for p in vids if p != ref]
    music = Path(args.music) if args.music else next((p for p in sorted(inp.rglob("*")) if p.stem.lower() == "music" and p.suffix.lower() in AUDIO_EXT), None)
    return ref, {p.stem: p for p in clips}, music


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--drive", help="Google Drive folder URL to download into the input folder")
    ap.add_argument("--input", default=str(ROOT / "input"))
    ap.add_argument("--reference")
    ap.add_argument("--clips", nargs="*")
    ap.add_argument("--music")
    ap.add_argument("--duration", type=float, default=26.0)
    ap.add_argument("--fps", type=float, help="output fps (default: the reference's)")
    ap.add_argument("--cuts", help="comma separated cut times in reference seconds (skips detection)")
    ap.add_argument("--plan", default=str(ROOT / "shot_plan.json"), help="manual in-points (used if it matches the clips)")
    ap.add_argument("--auto", action="store_true", help="ignore the manual plan")
    ap.add_argument("--any-order", action="store_true", help="don't force shots to follow the clips' order")
    ap.add_argument("--grade", type=float, default=GRADE_STRENGTH, help="tone-match strength 0..1")
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args()

    ensure_ffmpeg()
    inp = Path(args.input)
    if args.drive and not any(p.suffix.lower() in VIDEO_EXT for p in inp.rglob("*")):
        download(args.drive, inp)
    ref, clips, music = find_inputs(inp, args)
    (ROOT / "analysis").mkdir(exist_ok=True)

    print("== Reference")
    info = probe(ref)
    print(f"  {ref.name}: {info['width']}x{info['height']} ({info['aspect']}), {info['fps']} fps nominal / {info['avg_fps']} avg"
          f"{' (variable frame rate)' if info['vfr'] else ''}, {info['duration']:.3f}s")
    an = analyze_reference(ref, info, [float(t) for t in args.cuts.split(",")] if args.cuts else None, args.duration)
    print("== Raw clips")
    clip_info, raw = {}, {}
    for name, p in clips.items():
        clip_info[name] = probe(p)
        ci = clip_info[name]
        print(f"  {p.name}: {ci['width']}x{ci['height']} ({ci['aspect']}), {ci['fps']} fps, {ci['duration']:.2f}s")
        raw[name] = analyze_video(p, SAMPLE_FPS)

    print("== Matching shots")
    plan = match(an, clips, raw, info["fps"], ordered=not args.any_order)
    auto = {k: dict(v) for k, v in plan.items()}
    manual_used = False
    pf = Path(args.plan)
    if pf.exists() and not args.auto:
        mp = json.loads(pf.read_text())
        same = mp.get("clips") == {n: Path(p).stat().st_size for n, p in clips.items()} and len(mp.get("shots", [])) == len(plan)
        if same:
            for s in mp["shots"]:
                if s["shot"] in plan:
                    plan[s["shot"]].update(clip=s["clip"], start=s["start"], manual=True, note=s.get("note", ""))
            manual_used = True
        else:
            print(f"  {pf.name} was made for other clips/shots - ignoring it (auto plan only)")
    for k, v in plan.items():
        a = auto[k]
        print(f"  shot {k:2d}: auto {a['clip']}@{a['start']:6.2f}s (score {a['score']:.3f})" +
              (f"   -> using {v['clip']}@{v['start']:.2f}s from {pf.name}" if v.get("manual") else ""))

    chosen = [(plan[x["shot"]]["clip"], plan[x["shot"]]["start"], plan[x["shot"]]["start"] + x["out_duration"] * x["speed"])
              for x in an["shots"] if x["kind"] == "footage"]
    curve = tone_curve(an, raw, chosen, args.grade) if args.grade > 0 else None

    # cuts.json
    cj = dict(reference={k: info[k] for k in ("file", "width", "height", "aspect", "fps", "avg_fps", "vfr", "duration")},
              target_duration=args.duration, time_scale=round(args.duration / info["duration"], 6),
              detection=dict(method="PySceneDetect ContentDetector scores; cut = local peak >= %.1f and >= %.1fx median of +-0.5 s"
                             % (CUT_MIN_PEAK, CUT_RATIO), rejected_candidates=an["rejected"]),
              normal_footage_fps=an["normal_fps"], cuts=an["cuts"],
              shots=[{k: v for k, v in x.items()} for x in an["shots"]],
              look=dict(tone_curve_raw_to_ref=[[round(a, 3), round(b, 3)] for a, b in curve] if curve else None))
    (ROOT / "cuts.json").write_text(json.dumps(cj, indent=2))
    (ROOT / "analysis" / "plan_auto.json").write_text(json.dumps(auto, indent=2))

    print("== Rendering")
    rows, outs, FPS, edges = build_edit(an, info, plan, clips, clip_info, music, args, curve)
    print("== Compare + checks")
    cmp_path = ROOT / "output" / "compare.mp4"
    compare_video(ref, info, outs[0], an["shots"], FPS, edges, cmp_path)
    match_sheet(ref, outs[0], an["shots"], info, FPS, edges, ROOT / "analysis" / "match_sheet.jpg")
    ok = verify(outs + [cmp_path], args.duration)

    lines = ["| shot | edit time | dur | source | source in -> out | effects |", "|---:|---|---:|---|---|---|"]
    for r in rows:
        src = f"{r['source']} {r['src'][0]:.2f}s -> {r['src'][1]:.2f}s" if "src" in r else "-"
        lines.append(f"| {r['shot']} | {r['out'][0]:.2f}-{r['out'][1]:.2f}s | {r['out'][1] - r['out'][0]:.2f}s | {r['source']} | {src} | {r['effects']} |")
    summary = "\n".join(lines)
    (ROOT / "output" / "summary.md").write_text(
        f"# Edit summary\n\nReference: {ref.name} ({info['duration']:.2f}s, scaled x{args.duration / info['duration']:.4f} to {args.duration:g}s)\n"
        f"Plan: {'manual in-points from ' + pf.name if manual_used else 'automatic matching'}\n\n{summary}\n")
    print("\n" + summary)
    if not music:
        print(f"\nNo music.mp3/.m4a/.wav in {inp} - skipped final_with_music.mp4")
    print("\nDuration check:", "OK" if ok else "FAILED")


if __name__ == "__main__":
    main()
