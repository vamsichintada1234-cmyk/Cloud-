"""Final check on edit/final.mp4 + stems. Writes edit/work/qa/* and edit/work/qa.json."""
import sys, json, subprocess, re; sys.path.insert(0, "edit/scripts")
import numpy as np, soundfile as sf
from edl import SEGMENTS, END, FPS, PIECES
Q = "edit/work/qa/"; subprocess.run(["mkdir", "-p", Q])
F = "edit/final.mp4"; res = {}
pr = json.loads(subprocess.run(["ffprobe","-v","error","-show_streams","-show_format","-of","json",F],capture_output=True,text=True).stdout)
v = [s for s in pr["streams"] if s["codec_type"]=="video"][0]; a = [s for s in pr["streams"] if s["codec_type"]=="audio"][0]
res["video"] = dict(codec=v["codec_name"], profile=v.get("profile"), size=f'{v["width"]}x{v["height"]}', fps=v["r_frame_rate"], frames=int(v["nb_frames"]), pix=v["pix_fmt"])
res["audio"] = dict(codec=a["codec_name"], sr=a["sample_rate"], ch=a["channels"], dur=float(a["duration"]))
res["duration_video_s"] = int(v["nb_frames"]) / FPS
def frames(idx, out, scale=270, cols=None):
    sel = "+".join(f"eq(n\\,{i})" for i in idx)
    cols = cols or len(idx)
    subprocess.run(["ffmpeg","-v","error","-y","-i",F,"-vf",f"select='{sel}',scale={scale}:-1,drawtext=text='%{{n}}':x=6:y=6:fontsize=22:fontcolor=yellow:box=1:boxcolor=black,tile={cols}x{-(-len(idx)//cols)}","-frames:v","1",Q+out],check=True)
# both sides of every cut
cuts = [round(s["start"]*FPS) for s in SEGMENTS[1:]]
frames([0, 1] + sum([[c-1, c] for c in cuts], []) + [round(END*FPS)-1], "cuts.jpg")
# contact sheet, every 6 frames (0.1 s)
n = res["video"]["frames"]; frames(list(range(0, n, 24)), "contact.jpg", 180, 10)
# head-layer presence and alignment in the split segment: rows above the card edge must differ from the pure graphic
s1n = round(SEGMENTS[0]["end"]*FPS)
def grab(src, i, filt=""):
    p = subprocess.run(["ffmpeg","-v","error","-i",src,"-vf",f"{filt}select='eq(n\\,{i})',format=rgb24","-frames:v","1","-f","rawvideo","-"],capture_output=True)
    return np.frombuffer(p.stdout,np.uint8).reshape(1920,1080,3).astype(int)
mb = "tmix=frames=4:weights='1 1 1 1',select='eq(mod(n\\,4)\\,3)',setpts=N/60/TB,"
head = []
for i in [0, 1, 40, 94, 140, s1n-1]:
    fin = grab(F, i); g = grab("edit/work/renders/S1_240.mp4", i, mb)
    d = np.abs(fin[1100:1195, 200:880] - g[1100:1195, 200:880]).sum(2) > 40
    head.append({"frame": i, "head_px_above_card": int(d.sum())})
res["head_presence"] = head
# alignment: just below the card edge the head layer and the card must show the same pixels (compare to source frame)
# audio
x, sr = sf.read("edit/stems/voice.wav"); m = x.mean(1)
w = int(0.01*sr); rms = 20*np.log10(np.sqrt((m[:len(m)//w*w].reshape(-1,w)**2).mean(1))+1e-9)
# longest silence (< -50 dBFS RMS, i.e. below the noise floor of the edited track) before the last word
lastword = 5.42; run = best = 0; bestat = 0
for k, r in enumerate(rms[:int(lastword*100)]):
    run = run+1 if r < -50 else 0
    if run > best: best, bestat = run, k
res["longest_silence_ms_in_speech"] = best*10; res["longest_silence_ends_at_s"] = bestat/100
# join gap: speech end -> next onset across the audio join
res["join_B1_B2_speech_gap_ms"] = round((PIECES[1]["out"] + 0.04 - (PIECES[0]["src_full_end"] - PIECES[0]["src_in"])) * 1000)
rz, _ = sf.read("edit/stems/riser.wav"); nz = np.where(np.abs(rz).max(1) > 1e-4)[0]
res["riser_audible_s"] = [round(nz[0]/sr, 4), round((nz[-1]+1)/sr, 4)]
sx, _ = sf.read("edit/stems/sfx.wav"); env = np.abs(sx).max(1)
on = np.where((env[1:] > 1e-3) & (env[:-1] <= 1e-3))[0]; res["sfx_onsets_s"] = [round(o/sr, 3) for o in on]
def ebu(path):
    o = subprocess.run(["ffmpeg","-nostats","-i",path,"-af","ebur128=peak=true","-f","null","-"],capture_output=True,text=True).stderr
    s = o[o.rfind("Summary"):]
    return dict(I=float(re.search(r"I:\s+(-?[\d.]+)", s).group(1)), TP=float(re.search(r"Peak:\s+(-?[\d.]+|-inf)", s).group(1)))
res["loudness"] = {k: ebu(f"edit/stems/{k}.wav") for k in ("voice","sfx","riser","music")}
res["loudness"]["master_wav"] = ebu("edit/work/master.wav"); res["loudness"]["final_mp4"] = ebu(F)
for k in res["loudness"]: res["loudness"][k]["samples"] = None
for k in ("voice","sfx","riser","music"):
    d = sf.info(f"edit/stems/{k}.wav"); res["loudness"][k]["samples"] = d.frames; res["loudness"][k]["sr"] = d.samplerate
json.dump(res, open("edit/work/qa.json","w"), indent=1); print(json.dumps(res, indent=1))
