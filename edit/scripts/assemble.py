"""Assemble final.mp4 from the cut table, in verifiable steps (each intermediate is lossless, 60 fps CFR, exact frame count):
  seg1 = S1 graphic (240->60 fps temporal mix) + card shadow + camera card + cut-out head (same source frames)
  seg2 = S2 graphic (240->60 fps temporal mix)          seg3 = full-screen camera
  final = concat(seg1, seg2, seg3) + overlay (cover f0 / captions / CTA) + master audio."""
import sys, subprocess; sys.path.insert(0, "edit/scripts")
from edl import SEGMENTS, END, SRC, FPS
S1, S2, S3 = SEGMENTS
W = "edit/work/"; R = W + "renders/"; I = W + "inter/"; subprocess.run(["mkdir", "-p", I])
n1, n2, n3 = [round((s["end"] - s["start"]) * FPS) for s in SEGMENTS]; N = n1 + n2 + n3
assert N == round(END * FPS)
FF = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
LOSSLESS = ["-c:v", "libx264", "-qp", "0", "-preset", "ultrafast", "-pix_fmt", "yuv444p", "-fps_mode", "cfr"]
def frames(p): return int(subprocess.run(["ffprobe","-v","error","-count_frames","-select_streams","v:0","-show_entries","stream=nb_read_frames","-of","csv=p=0",p],capture_output=True,text=True).stdout)
MB = "tmix=frames=4:weights='1 1 1 1',select='eq(mod(n\\,4)\\,3)',setpts=N/{fps}/TB".format(fps=FPS)
def cam_chain(off, n):   # 25 fps source -> 60 fps grid (frame shown = latest source frame at that instant), trimmed
    return f"setpts=PTS-STARTPTS,fps={FPS}:round=down,trim=start_frame={round(off*FPS)}:end_frame={round(off*FPS)+n},setpts=N/{FPS}/TB"
off1 = S1["src_in"] - 7.6            # split_src.mp4 / split_cutout.mov start at source 7.60 s
fc1 = ";".join([
  f"[0:v]{MB},format=rgba[g]",
  f"[1:v]{cam_chain(off1, n1)},crop=1080:1350:65:0,pad=1080:1920:0:570,format=rgba,split[camA][camB]",
  f"[2:v]{cam_chain(off1, n1)},format=rgba,crop=1080:1350:65:0,pad=1080:1920:0:570:color=black@0,alphaextract,format=gray[ma]",
  "[3:v]format=gray,setpts=N/60/TB[cm]", "[4:v]format=rgba,setpts=N/60/TB[sh]", "[5:v]format=gray,setpts=N/60/TB[fe]",
  "[camA][cm]alphamerge[card]",
  "[ma][fe]blend=all_mode=multiply[ha]",
  "[camB][ha]alphamerge[head]",
  "[g][sh]overlay=shortest=1[b1]", "[b1][card]overlay=shortest=1[b2]", "[b2][head]overlay=shortest=1,format=yuv444p[v]"])
img = lambda p: ["-loop", "1", "-framerate", str(FPS), "-t", f"{n1/FPS + 0.5}", "-i", p]
subprocess.run(FF + ["-i", R+"S1_240.mp4", "-i", W+"split_src.mp4", "-i", W+"split_cutout.mov"] + img(W+"card_mask.png") + img(W+"card_shadow.png") + img(W+"head_feather.png")
               + ["-filter_complex", fc1, "-map", "[v]", "-frames:v", str(n1), "-r", str(FPS)] + LOSSLESS + [I+"seg1.mp4"], check=True)
subprocess.run(FF + ["-i", R+"S2_240.mp4", "-vf", f"{MB},format=yuv444p", "-frames:v", str(n2), "-r", str(FPS)] + LOSSLESS + [I+"seg2.mp4"], check=True)
subprocess.run(FF + ["-ss", "12.0", "-i", SRC, "-map", "0:v:0", "-vf", f"{cam_chain(S3['src_in']-12.0, n3)},scale=1080:1920:flags=lanczos,format=yuv444p",
               "-frames:v", str(n3), "-r", str(FPS)] + LOSSLESS + [I+"seg3.mp4"], check=True)
got = [frames(I+f"seg{k}.mp4") for k in (1, 2, 3)]; print("segment frames", got, "expected", [n1, n2, n3]); assert got == [n1, n2, n3]
fc = ";".join([
  "[0:v][1:v][2:v]concat=n=3:v=1:a=0,settb=1/60,setpts=N[vc]",
  "[3:v]settb=1/60,setpts=N,format=yuva444p[ov]",
  "[vc][ov]overlay=shortest=1,format=yuv420p,setsar=1[vout]",
  f"[4:a]atrim=end_sample={round(END*48000)}[aout]"])
subprocess.run(FF + ["-i", I+"seg1.mp4", "-i", I+"seg2.mp4", "-i", I+"seg3.mp4", "-i", R+"OV_60.mov", "-i", W+"master.wav",
       "-filter_complex", fc, "-map", "[vout]", "-map", "[aout]", "-frames:v", str(N), "-r", str(FPS), "-fps_mode", "cfr",
       "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-profile:v", "high", "-pix_fmt", "yuv420p",
       "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
       "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", "edit/final.mp4"], check=True)
print("final frames", frames("edit/final.mp4"), "expected", N)
