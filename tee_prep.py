"""TeeAd prep: analyse the music, derive a beat-synced cut from it, render the music edit and the
per-shot clips, and write src/teeTimeline.json for the Remotion composition (src/TeeAd.tsx).

No fixed timestamps: every cut is a beat index found by the analysis. Only the source in-points
(what part of each clip to show) are authored below. Run: python3 tee_prep.py [--analyse-only]
"""
import json, os, subprocess, sys
import numpy as np, librosa, soundfile as sf

ROOT = "/home/user/Cloud-/"
RAW = ROOT + "raw/tee/"            # downloaded footage + music (gitignored)
OUT = RAW + "shots/"               # rendered shot clips + music edit (served via public/raw)
MUSIC = RAW + "audio.mp3"
FPS = 25                           # matches the footage, so 1x shots need no frame-rate conversion
W, H = 1080, 1920
ANALYSE_ONLY = "--analyse-only" in sys.argv

# ---------------------------------------------------------------- 1. analyse the track
y, sr = librosa.load(MUSIC, sr=22050, mono=True)
HOP = 256
song_len = len(y) / sr
onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
ot = librosa.times_like(onset, sr=sr, hop_length=HOP)
_, raw_beats = librosa.beat.beat_track(onset_envelope=onset, sr=sr, hop_length=HOP, units="time", tightness=100)

# the track sits on a fixed tempo, so fit a straight grid through the tracked beats (removes
# frame-quantisation jitter), then nudge its phase onto the onset peaks
i = np.arange(len(raw_beats))
period, t0 = np.polyfit(i, raw_beats, 1)
if np.abs(raw_beats - (t0 + period * i)).max() > 0.03:
    sys.exit("tempo drifts; grid fit rejected - use raw beats instead")
shifts = np.arange(-0.03, 0.0301, 0.002)
t0 += shifts[np.argmax([np.interp(t0 + s + period * i, ot, onset).sum() for s in shifts])]
n_beats = int((song_len - t0) / period) + 1
beats = t0 + period * np.arange(n_beats)
bpm = 60 / period

S = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP))
_, P = librosa.decompose.hpss(S)
st = librosa.times_like(S[0], sr=sr, hop_length=HOP)
freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
perc = P.sum(0)
low = S[freqs < 150].sum(0)

def mean_in(sig, a, b): m = (st >= a) & (st < b); return sig[m].mean() if m.any() else 0.0
hit = np.array([onset[(ot > b - 0.03) & (ot < b + 0.03)].max() for b in beats])      # transient on the beat
beat_perc = np.array([mean_in(perc, b, b + period) for b in beats])                   # drums during the beat
beat_low = np.array([mean_in(low, b, b + 0.12) for b in beats])                        # bass/kick on the beat
harm = np.array([mean_in(S.sum(0) - perc, b, b + period) for b in beats])

# bar phase: the beat position (of 4) that carries the most kick/bass energy is the downbeat
phase = int(np.argmax([beat_low[p::4].mean() for p in range(4)]))
is_down = (np.arange(n_beats) % 4) == phase

# quiet -> hit events: a strong transient whose 1.5-beat lead-in is clearly quieter than usual
# (drums and overall level both measured between the beats, so the lead-in's own hits don't mask it)
tot = S.sum(0)
lead = lambda b: (mean_in(perc, b - 1.5 * period, b - 0.04) / np.median(perc) +
                  mean_in(tot, b - 1.5 * period, b - 0.04) / np.median(tot)) / 2
pause = np.array([lead(b) if b > 1.5 * period else 9.0 for b in beats])
hit_thr = np.percentile(hit, 75)
events = [k for k in range(n_beats) if pause[k] < 0.9 and hit[k] >= hit_thr]

print(f"tempo {bpm:.2f} BPM  beat {period*1000:.1f} ms  grid t0 {t0:.3f}s  beats {n_beats}  downbeat phase {phase}")
print("quiet->hit events (beat, time, hit, quiet-perc ratio):",
      [(k, round(beats[k], 3), round(hit[k], 1), round(pause[k], 2)) for k in events])

# ---------------------------------------------------------------- 2. plan the cut (in beats)
WAIT_BEATS, DONE_BEATS, STEP_MAX, STEP_MIN = 4, 4, 4, 3
N_STEPS = 3                                # step1, step3, step4 (step 2 cut from the edit)
POST_MIN = DONE_BEATS + 3 * 4 + 3          # beats needed after the drop: done, 3 shots, end card

# hook rides the intro and cuts on the first breakdown->hit (if the intro has one), else after 2 bars
intro = [k for k in events if beats[k] < 8]
hook_end = intro[0] if intro else next(k for k in range(8, n_beats) if is_down[k])
# the drop: strongest breakdown->hit that leaves room for the payoff after it
drops = [k for k in events if k >= hook_end + 2 * STEP_MAX and n_beats - k >= POST_MIN]
if not drops: sys.exit("no usable breakdown->drop found")
drop = max(drops, key=lambda k: hit[k])
wait_start = drop - WAIT_BEATS

# the process steps, 3-4 beats each. If the song has more music between hook and breakdown than
# the steps need, splice it out: jump from the end of the steps straight to the breakdown, keeping the
# bar phase (steps_total chosen so both sides of the splice sit at the same position in the bar)
gap = wait_start - hook_end
if N_STEPS * STEP_MIN <= gap <= N_STEPS * STEP_MAX:
    steps_total, splice = gap, None
else:
    steps_total = next(n for n in range(N_STEPS * STEP_MAX, N_STEPS * STEP_MIN - 1, -1) if (hook_end + n - wait_start) % 4 == 0)
    splice = (hook_end + steps_total, wait_start)          # (song beat we leave, song beat we land on)
steps = [STEP_MAX] * N_STEPS
for j in [1, 0, 2]:                                        # shorten "line it up" first, the lever shot last
    if sum(steps) > steps_total: steps[j] -= 1

# end card on the last strong downbeat that still leaves a bar of music; payoff shots share the rest
end_beat = max(k for k in range(n_beats) if is_down[k] and n_beats - k >= 4)
rest = end_beat - (drop + DONE_BEATS)
made = anyt = rest // 3
wear = rest - made - anyt
print(f"hook_end {hook_end}  steps {steps}  splice {splice}  wait {wait_start}  drop {drop}  end card {end_beat}  payoff {made}/{anyt}/{wear}")

# ---------------------------------------------------------------- 3. music edit + video beat map
CROSS = 0.010
ya, sra = librosa.load(MUSIC, sr=44100, mono=False)
if splice:
    a, b = beats[splice[0]], beats[splice[1]]
    na, nb, nc = int(a * sra), int(b * sra), int(CROSS * sra)
    fade = np.sin(np.linspace(0, np.pi / 2, 2 * nc)) ** 2
    seam = ya[:, na - nc:na + nc] * (1 - fade) + ya[:, nb - nc:nb + nc] * fade
    edit = np.concatenate([ya[:, :na - nc], seam, ya[:, nb + nc:]], axis=1)
    removed = b - a
else:
    edit, removed = ya, 0.0
total = edit.shape[1] / sra

# video-timeline beats: song beats before the splice, then song beats after it, shifted back
song_beats = list(range(0, splice[0])) + list(range(splice[1], n_beats)) if splice else list(range(n_beats))
vbeat_t = [beats[k] - (removed if splice and k >= splice[1] else 0) for k in song_beats]
vb = {k: n for n, k in enumerate(song_beats)}              # song beat index -> video beat index
fr = lambda t: int(round(t * FPS))
beat_frames = [fr(t) for t in vbeat_t]

# ---------------------------------------------------------------- 4. shots (content = in-points, timing = beats)
# role, src clip, in-point (s), speed, beats, anchor: (source time, beat within shot) to lock an action to a beat
SHOTS = [
    dict(id="hook",   src="clip02", t=2.0,   speed=1.0, beats=hook_end),        # tee hero, slow push-in
    dict(id="step1",  src="clip01", t=3.45,  speed=1.0, beats=steps[0]),        # holding up the printed photo, smiling
    dict(id="step3",  src="clip01", t=30.55, speed=1.0, beats=steps[1]),        # side profile, laying the tee on the press
    dict(id="step4",  src="clip01", t=None,  speed=1.0, beats=steps[2], anchor=(69.00, 1)),  # lever slams down on beat 2
    dict(id="wait",   src="clip01", t=75.0,  speed=1.0, beats=WAIT_BEATS),      # sitting, staring at the press
    dict(id="doneA",  src="clip01", t=80.95, speed=1.0, beats=DONE_BEATS // 2), # press flies open on the drop
    dict(id="doneB",  src="clip01", t=87.60, speed=1.0, beats=DONE_BEATS - DONE_BEATS // 2),  # finished tee held up
    dict(id="made",   src="clip02", t=26.10, speed=0.5, beats=made),            # dark hero pull-back, slow motion
    dict(id="any",    src="clip02", t=38.70, speed=0.5, beats=anyt),            # diagonal tee, slow motion
    dict(id="wear",   src="clip03", t=18.40, speed=1.0, beats=wear),            # pointing at the viewer
]
song_k = 0                                                 # walk the song beats shot by shot
for s in SHOTS:
    k0 = wait_start if s["id"] == "wait" else song_k        # the splice (if any) lands here
    s["songBeat"] = int(k0)
    s["beat"] = vb[k0]
    s["from"] = beat_frames[s["beat"]] if s["beat"] else 0
    s["dur"] = beat_frames[s["beat"] + s["beats"]] - s["from"]
    song_k = k0 + s["beats"]
    if s.get("anchor"):
        at, nb_ = s.pop("anchor")
        s["t"] = round(at - (beat_frames[s["beat"] + nb_] - s["from"]) / FPS * s["speed"], 3)
doneA = next(s for s in SHOTS if s["id"] == "doneA")
assert doneA["songBeat"] == drop and song_k == end_beat, (doneA["songBeat"], song_k)
end = dict(id="end", beat=vb[end_beat], songBeat=int(end_beat), **{"from": beat_frames[vb[end_beat]]})
total_frames = fr(total)
end["dur"] = total_frames - end["from"]

for s in SHOTS:
    print(f"{s['id']:6s} song beat {s['songBeat']:2d} ({beats[s['songBeat']]:6.3f}s)  video {s['from']/FPS:6.2f}s  "
          f"{s['beats']} beats  {s['src']} @ {s['t']}s x{s['speed']}")
print(f"end    song beat {end_beat} video {end['from']/FPS:.2f}s   total {total:.2f}s ({total_frames} frames)")
if ANALYSE_ONLY: sys.exit()

# ---------------------------------------------------------------- 5. render media
os.makedirs(OUT, exist_ok=True)
sf.write(OUT + "music_edit.wav", edit.T, sra)

def render(s):
    out = f"{OUT}{s['id']}.mp4"
    n = s["dur"] + 2                                        # 2 spare frames so the video never runs short
    src_dur = n / FPS * s["speed"] + 0.2
    vf = f"scale={W}:{H}:flags=lanczos"
    if s["speed"] != 1:                                     # slow motion: motion-interpolate to fill the extra frames
        vf += (f",minterpolate=fps={FPS / s['speed']:g}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
               f",setpts={1 / s['speed']:g}*PTS")
    vf += f",fps={FPS},format=yuv420p"
    return subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-ss", str(s["t"]), "-t", f"{src_dur:.3f}",
                             "-i", f"{RAW}{s['src']}.mp4", "-vf", vf, "-frames:v", str(n), "-an",
                             "-c:v", "libx264", "-preset", "medium", "-crf", "16", out])
procs = [render(s) for s in SHOTS]
procs.append(subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-ss", "30.6", "-i", RAW + "clip02.mp4",
                               "-vf", f"scale={W}:{H}", "-frames:v", "1", "-q:v", "2", OUT + "endcard.jpg"]))
if any(p.wait() for p in procs): sys.exit("ffmpeg failed")

timeline = dict(
    fps=FPS, width=W, height=H, totalFrames=total_frames, bpm=round(bpm, 2),
    beatFrames=beat_frames, dropBeat=vb[drop],
    splice=dict(songOut=round(beats[splice[0]], 3), songIn=round(beats[splice[1]], 3)) if splice else None,
    shots=[{k: s[k] for k in ("id", "beat", "beats", "from", "dur", "songBeat")} for s in SHOTS] + [end],
)
with open(ROOT + "src/teeTimeline.json", "w") as fh: json.dump(timeline, fh, indent=1)
print("wrote", ROOT + "src/teeTimeline.json")
