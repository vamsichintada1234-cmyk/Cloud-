"""Hibro01 edit: cut dead air & bad takes, add music, SFX and text. Renders output/Hibro01_edit.mp4 (1920x1080)."""
import subprocess, sys
R = "/home/user/Cloud-/raw/"; A = "/home/user/Cloud-/assets/"
FONT = A + "fonts/BebasNeue-Regular.ttf"
PREVIEW = "--preview" in sys.argv

# (file, in, out) — kept segments, in story order
SEGS = [
    ("01.MP4",  2.0, 23.0),   # intro at entrance + walk-in talk
    ("01.MP4", 27.0, 39.3),   # reaching the cutting table
    ("01.MP4", 40.3, 58.3),   # cutting machine in action (wide)
    ("01.MP4", 67.1, 75.5),   # explanation
    ("01.MP4", 78.0, 83.0),   # close-up B-roll of the blade
    ("02.MP4",  0.0,  7.5),   # front angle talk
    ("02.MP4", 30.5, 35.0),   # front angle cutting B-roll
]
starts, t = [], 0.0
for _, a, b in SEGS: starts.append(t); t += b - a
TOTAL = t

# (text, start, end, style)  style: title | lower | end
TEXT = [
    ("INSIDE A GARMENT FACTORY", 0.3, 4.0, "title"),
    ("HIBRO  |  EP 01",          0.6, 4.0, "sub"),
    ("LET'S GO INSIDE",          starts[0]+12.0, starts[0]+15.5, "lower"),
    ("THE CUTTING SECTION",      starts[1]+4.0,  starts[1]+8.0,  "lower"),
    ("STRAIGHT KNIFE CUTTING MACHINE", starts[2]+1.0, starts[2]+5.5, "lower"),
    ("MANY LAYERS. ONE CUT.",    starts[2]+9.0,  starts[2]+13.0, "lower"),
    ("PRECISION CUTTING",        starts[4]+0.5,  starts[4]+4.5,  "lower"),
    ("SUBSCRIBE FOR MORE",       TOTAL-3.8, TOTAL, "title"),
    ("Music: Funkorama - Kevin MacLeod (incompetech.com) CC BY 4.0", TOTAL-3.8, TOTAL, "credit"),
]
STYLE = {  # fontsize, y, box   (all text kept inside 10% title-safe area of 1920x1080)
    "title":  (130, "(h-text_h)/2-60", "box=1:boxcolor=black@0.55:boxborderw=30"),
    "sub":    (56,  "(h)/2+70",        "box=1:boxcolor=0xFFC400@0.95:boxborderw=14:fontcolor=black"),
    "lower":  (78,  "h-text_h-150",    "box=1:boxcolor=black@0.6:boxborderw=22"),
    "credit": (30,  "h-text_h-120",    "box=1:boxcolor=black@0.5:boxborderw=10"),
}
def esc(s): return s.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’")

# SFX: (file, time, gain)
SFX = [("impact.wav", 0.25, 0.8), ("whoosh.wav", 0.5, 0.6)]
for s in starts[1:]: SFX.append(("whoosh.wav", max(0, s-0.35), 0.45))
for txt, a, _, st in TEXT:
    if st == "lower": SFX.append(("pop.wav", a, 0.6))
SFX += [("riser.wav", starts[4]-1.5, 0.35), ("ding.wav", TOTAL-3.8, 0.6)]

args, fc = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-stats"], []
for i, (f, a, b) in enumerate(SEGS):
    args += ["-ss", str(a), "-t", str(b-a), "-i", R+f]
n = len(SEGS)
for i, (_, a, b) in enumerate(SEGS):
    d = b - a
    fc.append(f"[{i}:v:0]scale=1920:1080:flags=lanczos,fps=25,format=yuv420p,setsar=1,eq=contrast=1.05:saturation=1.15[v{i}]")
    fc.append(f"[{i}:a:0]aresample=48000,afade=t=in:d=0.04,afade=t=out:st={d-0.04:.2f}:d=0.04[a{i}]")
fc.append("".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[vc][dlg]")
# text
draws = []
for txt, a, b, st in TEXT:
    fs, y, box = STYLE[st]
    col = "" if "fontcolor" in box else ":fontcolor=white"
    alpha = f"if(lt(t,{a}+0.25),(t-{a})/0.25,if(gt(t,{b}-0.25),({b}-t)/0.25,1))"
    draws.append(f"drawtext=fontfile={FONT}:text='{esc(txt)}':fontsize={fs}{col}:x=(w-text_w)/2:y={y}:{box}"
                 f":alpha='{alpha}':enable='between(t,{a},{b})'")
fc.append("[vc]" + ",".join(draws) + ",fade=t=in:d=0.5,fade=t=out:st=%.2f:d=0.8[vout]" % (TOTAL-0.8))
# music + ducking under dialogue
mi = n; args += ["-stream_loop", "-1", "-i", A+"music/Funkorama.mp3"]
fc.append(f"[{mi}:a]atrim=0:{TOTAL},asetpts=N/SR/TB,aresample=48000,volume=0.35,afade=t=in:d=1.5,afade=t=out:st={TOTAL-2.5}:d=2.5[mus]")
fc.append("[dlg]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,asplit=2[dlg1][key]")
fc.append("[mus][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[musd]")
mix = ["[dlg1]", "[musd]"]
for k, (f, at, g) in enumerate(SFX):
    j = mi + 1 + k; args += ["-i", A+"sfx/"+f]
    fc.append(f"[{j}:a]volume={g},adelay={int(at*1000)}:all=1[s{k}]"); mix.append(f"[s{k}]")
fc.append("".join(mix) + f"amix=inputs={len(mix)}:normalize=0:duration=first,alimiter=limit=0.95[aout]")

out = "/home/user/Cloud-/output/Hibro01_edit" + ("_preview" if PREVIEW else "") + ".mp4"
args += ["-filter_complex", ";".join(fc), "-map", "[vout]", "-map", "[aout]",
         "-c:v", "libx264", "-preset", "ultrafast" if PREVIEW else "medium", "-crf", "28" if PREVIEW else "19",
         "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", f"{TOTAL:.2f}", out]
print(f"segments={n} total={TOTAL:.1f}s starts={[round(s,1) for s in starts]}")
subprocess.run(args, check=True); print("wrote", out)
