"""Re-edit in the reference video's style: long takes in the reference's shot order,
motion-blur whips on the first three cuts, hard cuts after, speed-ramp into the final
pose, 'Link in bio' caption and a WhatsApp end card. Cuts snap to our audio's beats."""
import json, subprocess
G1 = "eq=brightness=0.06:contrast=1.03"           # clip1: lift to the reference's bright white wall
G2 = "eq=brightness=0.05:gamma=1.08"              # clip2: dark product shots, lifted like the reference
G3 = "eq=brightness=0.015"                        # clip3: already close to the reference
ZOOM = "crop=830:1476:125:145,scale=1080:1920"    # punch in on the print for the extreme close-up
# (label, clip, src_start, out_frames, speed, extra filter)
SHOTS = [
    ("hook: showing the print to camera",          1,  2.40, 104, 1.00, G1),
    ("holding up the blank black tee",             1, 26.50,  37, 1.00, G1),
    ("heat press: lift + press (long take)",       1, 52.50, 141, 1.25, G1),
    ("product wide on dark floor",                 2,  0.00,  56, 1.00, G2),
    ("product partially in frame, sliding in",     2, 26.00,  56, 1.00, G2),
    ("extreme close-up on the artwork",            2, 21.30,  76, 1.00, G2 + "," + ZOOM),
    ("product rotated on dark floor",              2, 37.50,  74, 1.00, G2),
    ("showing the shirt to camera",                3,  5.00,  27, 1.00, G3),
    ("hand on shirt — 0.5x slow-mo ramp",          3,  5.90,  29, 0.50, G3),
    ("final pose + gestures (Link in bio)",        3,  9.80, 113, 1.00, G3),
]
END_FRAMES = 67
args = ["ffmpeg", "-v", "error", "-y"]; fc = []
for k, (_, c, ss, n, sp, flt) in enumerate(SHOTS):
    src = n * sp / 30
    args += ["-ss", str(ss), "-t", f"{src + 0.4:.3f}", "-i", f"clip{c}.mp4"]
    fc.append(f"[{k}:1]setpts=(PTS-STARTPTS)/{sp},fps=30,trim=end_frame={n},setpts=PTS-STARTPTS,{flt},setsar=1[v{k}]")
k = len(SHOTS)
fc.append(f"color=c=black:s=1080x1920:r=30:d={END_FRAMES/30:.4f},format=yuv420p,setsar=1[v{k}]")
fc.append("".join(f"[v{i}]" for i in range(k + 1)) + f"concat=n={k+1}:v=1:a=0[out]")
args += ["-filter_complex", ";".join(fc), "-map", "[out]", "-r", "30", "-c:v", "libx264", "-preset", "veryfast",
         "-crf", "16", "-g", "15", "-pix_fmt", "yuv420p", "ref_style/base.mp4"]
subprocess.run(args, check=True)
f = 0; cuts = []
for s in SHOTS:
    cuts.append(dict(frame=f, t=round(f / 30, 3), shot=s[0], clip=s[1], src=s[2], speed=s[4])); f += s[3]
cuts.append(dict(frame=f, t=round(f / 30, 3), shot="end card", clip=None))
json.dump(cuts, open("ref_style_cuts.json", "w"), indent=1)
for c in cuts: print(c)
