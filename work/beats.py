import librosa, numpy as np, json, sys
y, sr = librosa.load(sys.argv[1], sr=22050)
dur = len(y)/sr
oenv = librosa.onset.onset_strength(y=y, sr=sr)
tempo, bf = librosa.beat.beat_track(onset_envelope=oenv, sr=sr)
bt = librosa.frames_to_time(bf, sr=sr)
times = librosa.times_like(oenv, sr=sr)
W = 26.0
best = (-1, 0)
for s in np.arange(0, max(0.001, dur - W) + 1e-6, 0.05):
    m = (times >= s) & (times < s + W)
    e = oenv[m].mean()
    if e > best[0]: best = (e, s)
start = float(best[1])
# snap window start to nearest beat at/after start if close
cand = [b for b in bt if abs(b - start) < 0.6]
if cand: start = float(min(cand, key=lambda b: abs(b - start)))
start = min(start, dur - W)
rms = librosa.feature.rms(y=y)[0]
rt = librosa.times_like(rms, sr=sr)
beats = []
for b in bt:
    if start - 1e-3 <= b < start + W:
        i = np.argmin(abs(times - b)); j = np.argmin(abs(rt - b))
        beats.append({"t": round(float(b - start), 3), "src": round(float(b), 3), "onset": round(float(oenv[i]), 3), "rms": round(float(rms[j]), 4)})
on = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr, units='time')
on_str = [float(oenv[np.argmin(abs(times - o))]) for o in on]
thr = np.percentile(on_str, 85)
strong = [round(float(o - start), 3) for o, s in zip(on, on_str) if s >= thr and start <= o < start + W]
# downbeats: every 4th beat, phase chosen by max onset sum
ph = max(range(4), key=lambda p: sum(b["onset"] for b in beats[p::4]))
for k, b in enumerate(beats): b["downbeat"] = (k - ph) % 4 == 0
out = {"bpm": round(float(np.atleast_1d(tempo)[0]), 2), "audio_duration": round(dur, 3), "window_start": round(start, 3), "window_end": round(start + W, 3), "beats": beats, "strong_onsets": strong}
json.dump(out, open(sys.argv[2], "w"), indent=1)
print(out["bpm"], start, len(beats), "strong:", strong)
print([ (b["t"], b["downbeat"], b["onset"]) for b in beats])
