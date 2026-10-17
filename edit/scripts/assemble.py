"""Assemble final.mp4 from the cut table (edl.SEGMENTS), in verifiable steps (lossless, 60 fps CFR, exact frame counts):
  B (split)  = graphic (240->60 fps temporal mix) + card shadow + camera card + cut-out head (same source frames)
  C (visual) = graphic (240->60 fps temporal mix)            A (full)   = camera only
  final = concat(all segments) + overlay (cover f0 / captions / CTA) + master audio."""
import sys, subprocess; sys.path.insert(0, "edit/scripts")
from edl import SEGMENTS, END, SRC, FPS
W = "edit/work/"; R = W + "renders/"; I = W + "inter/"; subprocess.run(["mkdir", "-p", I])
N = round(END * FPS)
FF = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
LOSSLESS = ["-c:v", "libx264", "-qp", "0", "-preset", "ultrafast", "-pix_fmt", "yuv444p", "-fps_mode", "cfr"]
def frames(p): return int(subprocess.run(["ffprobe","-v","error","-count_frames","-select_streams","v:0","-show_entries","stream=nb_read_frames","-of","csv=p=0",p],capture_output=True,text=True).stdout)
MB = f"tmix=frames=4:weights='1 1 1 1',select='eq(mod(n\\,4)\\,3)',setpts=N/{FPS}/TB"
def cam_chain(off, n):   # 25 fps source -> 60 fps grid (latest source frame at each instant), trimmed
    return f"setpts=PTS-STARTPTS,fps={FPS}:round=down,trim=start_frame={round(off*FPS)}:end_frame={round(off*FPS)+n},setpts=N/{FPS}/TB"
# split sources: clip (1210x2150, lossless) + cutout, clip start in source seconds, image top on the canvas
SPLIT = {"S1": ("split_src.mp4", "split_cutout.mov", 7.60, 570), "S5": ("split2_src.mp4", "split2_cutout.mov", 0.60, 470)}
parts = []
for s in SEGMENTS:
    n = round((s["end"] - s["start"]) * FPS); out = I + s["id"] + ".mp4"; parts.append((out, n))
    if s["layout"] == "B":
        clip, cut, c0, ytop = SPLIT[s["id"]]; off = s["src_in"] - c0; ch = 1920 - ytop
        fc = ";".join([
          f"[0:v]{MB},format=rgba[g]",
          f"[1:v]{cam_chain(off, n)},crop=1080:{ch}:65:0,pad=1080:1920:0:{ytop},format=rgba,split[camA][camB]",
          f"[2:v]{cam_chain(off, n)},format=rgba,crop=1080:{ch}:65:0,pad=1080:1920:0:{ytop}:color=black@0,alphaextract,format=gray[ma]",
          "[3:v]format=gray,setpts=N/60/TB[cm]", "[4:v]format=rgba,setpts=N/60/TB[sh]", "[5:v]format=gray,setpts=N/60/TB[fe]",
          "[camA][cm]alphamerge[card]", "[ma][fe]blend=all_mode=multiply[ha]", "[camB][ha]alphamerge[head]",
          "[g][sh]overlay=shortest=1[b1]", "[b1][card]overlay=shortest=1[b2]", "[b2][head]overlay=shortest=1,format=yuv444p[v]"])
        img = lambda p: ["-loop", "1", "-framerate", str(FPS), "-t", f"{n/FPS + 0.5}", "-i", p]
        subprocess.run(FF + ["-i", R + f"{s['id']}_240.mp4", "-i", W + clip, "-i", W + cut] + img(W+"card_mask.png") + img(W+"card_shadow.png") + img(W+"head_feather.png")
                       + ["-filter_complex", fc, "-map", "[v]", "-frames:v", str(n), "-r", str(FPS)] + LOSSLESS + [out], check=True)
    elif s["layout"] == "C":
        subprocess.run(FF + ["-i", R + f"{s['id']}_240.mp4", "-vf", f"{MB},format=yuv444p", "-frames:v", str(n), "-r", str(FPS)] + LOSSLESS + [out], check=True)
    else:
        ss = max(0.0, s["src_in"] - 0.5)
        subprocess.run(FF + ["-ss", f"{ss}", "-i", SRC, "-map", "0:v:0", "-vf", f"{cam_chain(s['src_in'] - ss, n)},scale=1080:1920:flags=lanczos,format=yuv444p",
                       "-frames:v", str(n), "-r", str(FPS)] + LOSSLESS + [out], check=True)
    got = frames(out); print(s["id"], s["layout"], "frames", got, "expected", n); assert got == n
assert sum(n for _, n in parts) == N
k = len(parts)
fc = ";".join([
  "".join(f"[{i}:v]" for i in range(k)) + f"concat=n={k}:v=1:a=0,settb=1/60,setpts=N[vc]",
  f"[{k}:v]settb=1/60,setpts=N,format=yuva444p[ov]",
  "[vc][ov]overlay=shortest=1,format=yuv420p,setsar=1[vout]",
  f"[{k+1}:a]atrim=end_sample={round(END*48000)}[aout]"])
inp = sum([["-i", p] for p, _ in parts], []) + ["-i", R + "OV_60.mov", "-i", W + "master.wav"]
subprocess.run(FF + inp + ["-filter_complex", fc, "-map", "[vout]", "-map", "[aout]", "-frames:v", str(N), "-r", str(FPS), "-fps_mode", "cfr",
       "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-profile:v", "high", "-pix_fmt", "yuv420p",
       "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
       "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", "edit/final.mp4"], check=True)
print("final frames", frames("edit/final.mp4"), "expected", N)
