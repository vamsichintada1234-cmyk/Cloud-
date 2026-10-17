#!/usr/bin/env python3
"""Beat-synced Instagram reel pipeline (Google Drive -> rough cut -> final reel).

    python edit_reel.py --drive "<drive folder link>"
    python edit_reel.py --drive "<drive folder link>" --rough-only

Structure: S1 printing (4 cuts, 1x) -> S2 output (4 cuts, 0.5x slow-mo) -> S3 quality (3 cuts, last = CTA).
Video length == music length; every cut lands on a detected beat.
"""
import argparse, concurrent.futures as cf, json, os, platform, re, shutil, subprocess, sys, time
from pathlib import Path

import numpy as np

T0 = time.time()
FPS = 30
SECTIONS = [  # (folder, label, cuts, speed factor applied to PTS)
    ("1_printing", "S1", 4, 1.0),
    ("2_output", "S2", 4, 2.0),
    ("3_quality", "S3", 3, 1.0),
]
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mkv"}
EDGE_SKIP = 0.5          # skip shaky first/last 0.5 s of every clip
MIN_SEG = 1.2            # shortest allowed segment (s)
CTA_MIN = 3.0
CTA_LINES = ("WhatsApp", "7810024217")
FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/inter/InterDisplay-Black.otf",
    "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]


def log(msg):
    print(f"[{time.time() - T0:6.1f}s] {msg}", flush=True)


def die(msg):
    print(f"\nSTOP: {msg}", file=sys.stderr)
    sys.exit(1)


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def probe_duration(path, stream=None):
    cmd = ["ffprobe", "-v", "error"]
    if stream:
        cmd += ["-select_streams", stream, "-show_entries", "stream=duration"]
    else:
        cmd += ["-show_entries", "format=duration"]
    out = run(cmd + ["-of", "csv=p=0", str(path)]).stdout.strip().splitlines()
    try:
        return float(out[0])
    except (IndexError, ValueError):
        return None


# ---------------------------------------------------------------- Step 0: download
def gdown_folder(link, dest):
    base = ["gdown", "--folder", link, "-O", str(dest) + "/"]
    r = run(base + ["--remaining-ok"])
    if "unrecognized arguments: --remaining-ok" in r.stderr:  # gdown >= 6 dropped the flag (and the 50-file cap)
        r = run(base)
    return r


def download(link, project):
    if project.is_dir() and (find_layout(project)[0] or organize_flat(project)):
        log(f"inputs already present in {project}/ - skipping download")
        return
    if not link:
        die(f"no inputs in {project}/ and no --drive link given")
    log("downloading Drive folder with gdown ...")
    project.mkdir(parents=True, exist_ok=True)
    r = gdown_folder(link, project)
    text = r.stdout + r.stderr
    if r.returncode != 0 and re.search(r"permission|Anyone with the link|public link|status code 40[13]", text, re.I):
        die("Google Drive refused the download. Set the folder sharing to "
            "'Anyone with the link – Viewer' and run again.\n" + text[-800:])
    skipped = re.search(r"50 files|remaining-ok|skipp", text, re.I)
    if r.returncode != 0 or skipped:
        log("gdown failed or skipped files - retrying file by file")
        download_each(link, project)
    log("download finished")


def download_each(link, project):
    """Fallback: list every file (recursing into subfolders) and fetch each one separately."""
    import gdown
    try:
        files = gdown.download_folder(url=link, output=str(project) + "/", skip_download=True, quiet=True)
    except Exception as e:  # noqa: BLE001
        if re.search(r"permission|Anyone with the link", str(e), re.I):
            die("Google Drive refused the download. Set the folder sharing to "
                "'Anyone with the link – Viewer' and run again.")
        die(f"could not list Drive folder: {e}")
    for f in files:
        out = Path(f.local_path)
        if out.exists() and out.stat().st_size > 0:
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        gdown.download(id=f.id, output=str(out), quiet=True)


# ---------------------------------------------------------------- inputs / layout
def find_layout(project):
    clips = {s[0]: sorted(p for p in (project / "clips" / s[0]).glob("*") if p.suffix.lower() in VIDEO_EXT)
             for s in SECTIONS}
    music, srt_file = project / "audio" / "music.mp3", project / "audio" / "music.srt"
    missing = [f"clips/{k}/ (no video files)" for k, v in clips.items() if not v]
    missing += [f"audio/{p.name}" for p in (music, srt_file) if not p.exists()]
    return (None, missing) if missing else ((clips, music, srt_file), [])


def organize_flat(project):
    """Drive folder that is not in clips/<section>/ layout: map exactly 3 videos (sorted by name) to the
    3 sections and the single mp3 / srt to audio/music.*. Links only, the originals stay untouched."""
    files = [p for p in project.rglob("*") if p.is_file() and "clips" not in p.relative_to(project).parts[:1]
             and "audio" not in p.relative_to(project).parts[:1]]
    videos = sorted((p for p in files if p.suffix.lower() in VIDEO_EXT and "reference" not in p.name.lower()),
                    key=lambda p: p.name)
    mp3s = [p for p in files if p.name.lower().endswith(".mp3")]
    srts = [p for p in files if re.search(r"\.srt(\.txt)?$", p.name, re.I)]
    if len(videos) != len(SECTIONS) or len(mp3s) != 1 or len(srts) != 1:
        return False
    def link(src, dst):
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists() or dst.is_symlink():
            dst.unlink()
        try:
            os.link(src, dst)
        except OSError:
            dst.symlink_to(src.resolve())
    print("  Inputs were not in clips/<section>/ layout - mapping them by file name order:")
    for (folder, *_), v in zip(SECTIONS, videos):
        link(v, project / "clips" / folder / v.name)
        print(f"    {v.relative_to(project)}  ->  clips/{folder}/")
    link(mp3s[0], project / "audio" / "music.mp3")
    link(srts[0], project / "audio" / "music.srt")
    print(f"    {mp3s[0].relative_to(project)}  ->  audio/music.mp3")
    print(f"    {srts[0].relative_to(project)}  ->  audio/music.srt")
    return True


def resolve_inputs(project):
    layout, missing = find_layout(project)
    if layout is None and organize_flat(project):
        layout, missing = find_layout(project)
    if layout is None:
        die("missing inputs in " + str(project) + "/:\n  " + "\n  ".join(missing))
    return layout


def list_files(project):
    print(f"\n  {'file':58s} {'size':>10s} {'duration':>9s}")
    for p in sorted(x for x in project.rglob("*") if x.is_file()):
        d = probe_duration(p)
        print(f"  {str(p.relative_to(project)):58s} {p.stat().st_size / 1e6:8.1f}MB "
              f"{(f'{d:8.2f}s' if d else '       -')}")
    print()


# ---------------------------------------------------------------- beats + cut points
def parse_srt(path):
    text = Path(path).read_text(encoding="utf-8-sig", errors="replace")
    try:
        import srt
        return [(s.start.total_seconds(), s.end.total_seconds()) for s in srt.parse(text)]
    except Exception:  # noqa: BLE001 - fall back to a tolerant regex parser
        ts = r"(\d+):(\d+):(\d+)[,.](\d+)"
        sec = lambda m: int(m[0]) * 3600 + int(m[1]) * 60 + int(m[2]) + int(m[3]) / 1000
        return [(sec(m[:4]), sec(m[4:])) for m in re.findall(ts + r"\s*-->\s*" + ts, text)]


def detect_beats(music):
    import librosa
    y, sr = librosa.load(str(music), sr=22050, mono=True)
    onset = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, frames = librosa.beat.beat_track(onset_envelope=onset, sr=sr)
    times = librosa.frames_to_time(frames, sr=sr)
    strength = onset[frames] / (onset.max() or 1)
    return float(np.atleast_1d(tempo)[0]), times, strength


def choose_cuts(dur, beats, strength, srt_times, n_cuts=10):
    """DP over detected beats: n_cuts cut points, segments as even as possible, beats near SRT line
    boundaries and strong onsets preferred, last (CTA) segment >= 3 s and strictly the longest."""
    ok = (beats > MIN_SEG - 0.05) & (beats < dur - CTA_MIN)
    B, S = beats[ok], strength[ok]
    anchored = np.array([any(abs(b - t) <= 0.25 for t in srt_times) for b in B])
    bonus = 0.35 * anchored + 0.15 * S
    n, best = len(B), (np.inf, None)
    if n < n_cuts:
        die(f"only {n} usable beats detected - cannot place {n_cuts} beat-synced cuts")
    for last in range(n_cuts - 1, n):
        cta = dur - B[last]
        target = B[last] / n_cuts
        # cost[k][j]: best cost with k-th cut (0-based) at beat j
        cost = np.full((n_cuts, n), np.inf)
        prev = np.full((n_cuts, n), -1)
        for j in range(last):
            L = B[j]
            if MIN_SEG <= L < cta - 0.2:
                cost[0][j] = (L - target) ** 2 - bonus[j]
        for k in range(1, n_cuts):
            for j in range(k, last + 1):
                if k == n_cuts - 1 and j != last:
                    continue
                for i in range(k - 1, j):
                    if not np.isfinite(cost[k - 1][i]):
                        continue
                    L = B[j] - B[i]
                    if L < MIN_SEG or L >= cta - 0.2:
                        continue
                    c = cost[k - 1][i] + (L - target) ** 2 - bonus[j]
                    if c < cost[k][j]:
                        cost[k][j], prev[k][j] = c, i
        total = cost[n_cuts - 1][last] + 0.5 * (cta - max(CTA_MIN, 1.35 * target)) ** 2
        if total < best[0]:
            path, j = [], last
            for k in range(n_cuts - 1, -1, -1):
                path.append(j)
                j = prev[k][j]
            best = (total, path[::-1])
    if best[1] is None:
        die("could not find beat-aligned cut points that satisfy the CTA constraint")
    idx = best[1]
    return [float(B[i]) for i in idx], [bool(anchored[i]) for i in idx]


# ---------------------------------------------------------------- clip activity analysis
def clip_profile(path, w=36, h=64):
    """Keyframe-only decode (cheap) -> per-keyframe activity (frame diff) and spatial detail."""
    pk = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time,flags",
              "-of", "csv=p=0", str(path)]).stdout.split()
    kt = sorted(float(t) for t, f in (l.split(",")[:2] for l in pk if "," in l) if "K" in f and t != "N/A")
    raw = subprocess.run(["ffmpeg", "-v", "error", "-skip_frame", "nokey", "-i", str(path), "-map", "0:v:0",
                          "-vf", f"scale={w}:{h},format=gray", "-fps_mode", "passthrough", "-f", "rawvideo", "-"],
                         capture_output=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32)
    m = min(len(frames), len(kt))
    frames, kt = frames[:m], np.array(kt[:m])
    detail = frames.reshape(m, -1).std(axis=1)
    diff = np.abs(np.diff(frames, axis=0)).mean(axis=(1, 2)) if m > 1 else np.zeros(0)
    return {"t": kt, "detail": detail, "mid": (kt[1:] + kt[:-1]) / 2, "diff": diff,
            "dur": probe_duration(path, "v:0") or probe_duration(path)}


def usable_range(p):
    """Skip 0.5 s at both ends and keep only the longest run of keyframes with real detail
    (drops empty-wall / lens-covered stretches; a single dull keyframe does not break a run)."""
    lo, hi = EDGE_SKIP, p["dur"] - EDGE_SKIP
    t, n = p["t"], len(p["t"])
    if n > 2:
        good = p["detail"] >= 0.5 * np.percentile(p["detail"], 75)
        good[1:-1] |= good[:-2] & good[2:]
        runs, start = [], None
        for i, g in enumerate(list(good) + [False]):
            if g and start is None:
                start = i
            elif not g and start is not None:
                runs.append((start, i - 1))
                start = None
        if runs:
            a, b = max(runs, key=lambda r: t[r[1]] - t[r[0]])
            if a > 0:
                lo = max(lo, (t[a - 1] + t[a]) / 2)
            if b < n - 1:
                hi = min(hi, (t[b] + t[b + 1]) / 2)
    return lo, hi


def window_score(p, a, b):
    sel = (p["mid"] >= a - 0.6) & (p["mid"] <= b + 0.6)
    d = p["diff"][sel] if sel.any() else np.interp([(a + b) / 2], p["mid"], p["diff"]) if len(p["mid"]) else [0]
    d = np.asarray(d)
    return d.mean() - 0.6 * d.std()  # active but steady (no shake spikes)


def pick_sources(section_clips, needs, profiles):
    """needs: source seconds per cut. Returns [(clip, start)] keeping cuts chronological per clip."""
    clips = section_clips
    # distribute cuts over clips in proportion to usable length (each clip >= 1 cut while possible)
    lens = [max(0.1, np.subtract(*usable_range(profiles[c])[::-1])) for c in clips]
    counts = [1 if i < len(needs) else 0 for i in range(len(clips))]
    while sum(counts) < len(needs):
        i = int(np.argmax([l / (c + 1) for l, c in zip(lens, counts)]))
        counts[i] += 1
    out, k = [], 0
    for clip, cnt in zip(clips, counts):
        p = profiles[clip]
        lo, hi = usable_range(p)
        my = needs[k:k + cnt]
        span = hi - lo
        if span >= sum(my):  # chronological windows, one per cut, sized by need
            edges = lo + np.concatenate([[0], np.cumsum(my)]) / sum(my) * span
        else:  # short clip: overlapping but different sub-ranges
            edges = np.linspace(lo, max(lo, hi - max(my)), cnt + 1)
        for j, need in enumerate(my):
            wa, wb = edges[j], max(edges[j + 1], edges[j] + need)
            wb = min(wb, p["dur"] - 0.05)
            # start on a keyframe when one fits: ffmpeg then decodes no pre-roll frames (big speed win on HEVC)
            cands = p["t"][(p["t"] >= wa) & (p["t"] <= wb - need)]
            if not len(cands):
                cands = np.arange(wa, max(wa, wb - need) + 1e-6, 0.1)
            best = max(cands, key=lambda s: window_score(p, s, s + need))
            out.append((clip, float(max(0.0, min(best, p["dur"] - need - 0.05)))))
        k += cnt
    return out


# ---------------------------------------------------------------- rendering
def pick_encoder():
    tests = []
    if platform.system() == "Darwin":
        tests.append(("h264_videotoolbox", ["-c:v", "h264_videotoolbox", "-b:v", "14M", "-profile:v", "high"]))
    tests.append(("h264_nvenc", ["-c:v", "h264_nvenc", "-preset", "p1", "-rc", "vbr", "-cq", "21", "-b:v", "0",
                                 "-profile:v", "high"]))
    for name, args in tests:
        r = run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=1080x1920:r=30:d=0.2"]
                + args + ["-f", "null", "-"])
        if r.returncode == 0:
            return name, args
    return "libx264", ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "21"]


def font_file():
    for f in FONT_CANDIDATES:
        if Path(f).exists():
            return f
    return None


def drawtext_font():
    f = font_file()
    return f"fontfile='{f}'" if f else "font='Sans:style=Bold'"


def segment_cmd(seg, out, W, H, enc, label=None, punch=False, cta_file=None, skip_loop_filter=False):
    vf = [f"trim=duration={seg['src_dur'] + 0.4:.3f}", f"scale={W}:{H}:force_original_aspect_ratio=increase:flags=bicubic", f"crop={W}:{H}", "setsar=1"]
    if seg["speed"] != 1.0:
        vf.append(f"setpts={seg['speed']:.1f}*PTS")
    vf += [f"fps={FPS}", "format=yuv420p"]
    chain = ",".join(vf)
    if punch:  # 3-frame zoom punch on the beat
        zw, zh = int(W * 1.08) // 2 * 2, int(H * 1.08) // 2 * 2
        chain += (f",split[a][b];[a]trim=end_frame=3,scale={zw}:{zh},crop={W}:{H},setsar=1,setpts=PTS-STARTPTS[p];"
                  f"[b]trim=start_frame=3,setpts=PTS-STARTPTS[r];[p][r]concat=n=2:v=1:a=0")
    font = drawtext_font()
    if label:
        fs = max(18, H // 40)
        chain += (f",drawtext={font}:text='{label}':fontsize={fs}:fontcolor=white:x={fs // 2}:y={fs // 2}"
                  f":box=1:boxcolor=black@0.6:boxborderw={fs // 4}")
    if cta_file:
        fs = H // 21
        chain += (f",drawtext={font}:textfile='{cta_file}':fontsize={fs}:fontcolor=white:text_align=C"
                  f":line_spacing={fs // 4}:x=(w-text_w)/2:y=h*0.74-text_h/2"
                  f":box=1:boxcolor=black@0.6:boxborderw={fs // 2}:alpha='min(1,t/0.4)'")
    inp = ["-skip_loop_filter", "all"] if skip_loop_filter else []
    return (["ffmpeg", "-y", "-v", "error", "-ss", f"{seg['src_start']:.3f}"]
            + inp + ["-i", str(seg["clip"]), "-map", "0:v:0", "-an", "-sn", "-dn",
                     "-vf", chain, "-frames:v", str(seg["frames"])]  # -vf, not -filter_complex: lets ffmpeg stop decoding at -frames:v
            + enc + ["-pix_fmt", "yuv420p", "-r", str(FPS), "-video_track_timescale", "15360",
                     "-map_metadata", "-1", "-write_tmcd", "0", "-movflags", "+faststart", str(out)])


def render(segs, out_path, W, H, enc, workdir, audio, dur, labels=False, punch=False, fast_decode=False):
    workdir.mkdir(parents=True, exist_ok=True)
    cta_file = workdir / "cta.txt"
    cta_file.write_text("\n".join(CTA_LINES))
    jobs = []
    for i, s in enumerate(segs):
        lab = f"{s['name']} @ {s['start']:.2f}s" if labels else None
        jobs.append(segment_cmd(s, workdir / f"seg{i:02d}.mp4", W, H, enc, lab, punch,
                                cta_file if s["cta"] else None, fast_decode))
    with cf.ThreadPoolExecutor(max_workers=len(jobs)) as ex:
        results = list(ex.map(run, jobs))
    for s, r in zip(segs, results):
        if r.returncode:
            die(f"ffmpeg failed on {s['name']}:\n{r.stderr[-1500:]}")
    lst = workdir / "concat.txt"
    lst.write_text("".join(f"file '{(workdir / f'seg{i:02d}.mp4').resolve()}'\n" for i in range(len(segs))))
    joined = workdir / "joined.mp4"
    r = run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(joined)])
    if r.returncode:
        die("concat failed:\n" + r.stderr[-1500:])
    r = run(["ffmpeg", "-y", "-v", "error", "-i", str(joined), "-i", str(audio), "-map", "0:v:0", "-map", "1:a:0",
             "-c:v", "copy", "-af", "apad", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", f"{dur:.6f}",
             "-map_metadata", "-1", "-write_tmcd", "0",
             "-movflags", "+faststart", str(out_path)])
    if r.returncode:
        die("mux failed:\n" + r.stderr[-1500:])


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--drive", help="Google Drive folder link")
    ap.add_argument("--project", default="reel-project", help="local input folder (default reel-project)")
    ap.add_argument("--out", default="output", help="output folder (default output)")
    ap.add_argument("--rough-only", action="store_true", help="render only output/rough_cut.mp4")
    a = ap.parse_args()
    project, outdir = Path(a.project), Path(a.out)
    outdir.mkdir(parents=True, exist_ok=True)
    work = outdir / ".work"

    # Step 0 - download + inputs
    download(a.drive, project)
    (clips, music, srt_file) = resolve_inputs(project)
    list_files(project)
    log("step 0 done: inputs ready")

    # Step 1 - audio, SRT, beats  (in parallel with clip analysis)
    all_clips = [c for v in clips.values() for c in v]
    with cf.ThreadPoolExecutor(max_workers=len(all_clips) + 1) as ex:
        beat_f = ex.submit(detect_beats, music)
        prof_f = {c: ex.submit(clip_profile, c) for c in all_clips}
        dur = probe_duration(music)
        if not dur:
            die(f"could not read duration of {music}")
        srt_lines = parse_srt(srt_file)
        tempo, beats, strength = beat_f.result()
        profiles = {c: f.result() for c, f in prof_f.items()}
    srt_times = sorted({t for ab in srt_lines for t in ab if 0.3 < t < dur - 0.3})
    log(f"step 1 done: audio {dur:.3f}s, tempo {tempo:.1f} BPM, {len(beats)} beats, "
        f"{len(srt_lines)} SRT lines (boundaries used as preferred cut points)")

    # Step 2 - cut points + source picks
    n_cuts = sum(s[2] for s in SECTIONS)
    cuts, anchored = choose_cuts(dur, beats, strength, srt_times, n_cuts - 1)
    total_frames = int(round(dur * FPS))
    fr = [0] + [int(round(c * FPS)) for c in cuts] + [total_frames]
    segs, k = [], 0
    for folder, lab, n, speed in SECTIONS:
        lens = [(fr[k + j + 1] - fr[k + j]) / FPS for j in range(n)]
        needs = [L / speed for L in lens]
        picks = pick_sources(clips[folder], needs, profiles)
        for j, ((clip, ss), L, need) in enumerate(zip(picks, lens, needs)):
            segs.append({"name": f"{lab}-C{j + 1}", "clip": clip, "src_start": ss, "src_dur": need,
                         "speed": speed, "start": fr[k + j] / FPS, "dur": L, "frames": fr[k + j + 1] - fr[k + j],
                         "cta": folder == SECTIONS[-1][0] and j == n - 1,
                         "srt": k + j > 0 and anchored[k + j - 1]})
        k += n
    cta, others = segs[-1]["dur"], max(s["dur"] for s in segs[:-1])
    if cta < CTA_MIN or cta <= others:
        die(f"CTA segment {cta:.2f}s is not >= {CTA_MIN}s and the longest ({others:.2f}s)")

    print(f"\n  {'#':>2} {'cut':6} {'start':>7} {'end':>7} {'len':>5}  {'speed':5} {'beat@start':10} "
          f"{'source':28} {'src in':>7}")
    for i, s in enumerate(segs):
        tag = "start" if i == 0 else ("beat+SRT" if s["srt"] else "beat")
        print(f"  {i + 1:2d} {s['name']:6} {s['start']:7.3f} {s['start'] + s['dur']:7.3f} {s['dur']:5.2f}  "
              f"{('0.5x' if s['speed'] != 1 else '1x'):5} {tag:10} {s['clip'].name[:28]:28} {s['src_start']:7.2f}"
              + ("   <- CTA" if s["cta"] else ""))
    print(f"  cut points (s): {', '.join(f'{c:.3f}' for c in cuts)}\n")
    (outdir / "cut_list.json").write_text(json.dumps([{**s, "clip": str(s["clip"])} for s in segs], indent=1))
    log("step 2 done: cut list ready")

    enc_name, enc = pick_encoder()
    log(f"encoder: {enc_name}")

    # Step 3 - rough cut
    timing_file = work / "rough_timing.json"
    try:
        labels = json.loads(timing_file.read_text()).get("seconds", 0) <= 30
    except (OSError, ValueError):
        labels = True
    t = time.time()
    rough = outdir / "rough_cut.mp4"
    render(segs, rough, 540, 960, ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "30"], work / "rough",
           music, dur, labels=labels, fast_decode=True)
    rough_s = time.time() - t
    timing_file.write_text(json.dumps({"seconds": rough_s}))
    log(f"step 3 done: rough cut in {rough_s:.1f}s{'' if labels else ' (labels skipped: last rough cut > 30s)'}"
        f" -> {rough.resolve()}")
    if rough_s > 30:
        log("rough cut took > 30s - labels will be skipped on the next run")

    if not a.rough_only:
        # Step 4 - final render
        punch = time.time() - T0 < 180
        final = outdir / "final_reel.mp4"
        render(segs, final, 1080, 1920, enc, work / "final", music, dur, punch=punch)
        log(f"step 4 done: final render{' (zoom punch on)' if punch else ' (zoom punch skipped: > 3 min)'}"
            f" -> {final.resolve()}")
        check = final
    else:
        check = rough

    # Step 5 - check
    v = probe_duration(check, "v:0")
    au = probe_duration(check, "a:0")
    fmt = probe_duration(check)
    print(f"\n  music.mp3      : {dur:.3f}s\n  {check.name:15s}: container {fmt:.3f}s | video {v:.3f}s | audio {au:.3f}s")
    diff = max(abs(v - dur), abs(fmt - dur))
    print(f"  max difference : {diff:.3f}s -> {'OK (within 0.05s)' if diff <= 0.05 else 'MISMATCH'}")
    shutil.rmtree(work / "final", ignore_errors=True)
    log(f"TOTAL TIME {time.time() - T0:.1f}s")
    if diff > 0.05:
        sys.exit(2)


if __name__ == "__main__":
    main()
