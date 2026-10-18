"""Beat map for the custom-tee reel: beats, accents, drop, quiet pocket and final hit. Writes raw/tee/music.json.
Every cut, text reveal and transition in tee_edit.py is placed on these detected beats; nothing uses fixed timestamps."""
import json, sys
import librosa, numpy as np

SRC = sys.argv[1] if len(sys.argv) > 1 else "/home/user/Cloud-/raw/tee/audio.mp3"
OUT = "/home/user/Cloud-/raw/tee/music.json"
SR, HOP = 22050, 256

y, sr = librosa.load(SRC, sr=SR)
dur = len(y) / sr
_, yp = librosa.effects.hpss(y)                      # percussive part drives the beat grid
oenv = librosa.onset.onset_strength(y=yp, sr=sr, hop_length=HOP)
ot = librosa.times_like(oenv, sr=sr, hop_length=HOP)
tempo, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=HOP,
                                       start_bpm=160, tightness=400, units="time")
tempo = float(np.atleast_1d(tempo)[0])
# extend the grid to the end of the track so the outro has beats too
step = float(np.median(np.diff(beats)))
beats = list(beats)
while beats[-1] + step < dur - 0.05: beats.append(beats[-1] + step)
beats = np.array(beats)

# accent = strongest percussive onset within a frame or two of each beat
accent = np.array([oenv[(ot > b - 0.04) & (ot < b + 0.06)].max(initial=0) for b in beats])
rms = librosa.feature.rms(y=y, hop_length=HOP)[0]

# drop = biggest two-beat hit after the intro (the first fifth of the track is ignored)
lo = len(beats) // 5
drop = int(max(range(lo, len(beats) - 4), key=lambda i: accent[i] + accent[i + 1]))

# quiet pocket = quietest half second in the 3 s before the drop
win = int(0.5 * sr / HOP)
cand = [k for k in range(len(rms) - win) if beats[drop] - 3 <= ot[k] <= beats[drop] - 0.5]
qk = min(cand, key=lambda k: rms[k:k + win].mean())
quiet = int(np.argmin(abs(beats - ot[qk])))

# final strong beat = biggest accent 1.8–3.5 s before the music ends (leaves room for the end card)
tail = [i for i, b in enumerate(beats) if dur - 3.5 <= b <= dur - 1.8]
end_hit = int(max(tail, key=lambda i: accent[i]))

music = {
    "source": SRC, "duration": round(dur, 3), "tempo": round(tempo, 2),
    # a tracked tempo above 120 BPM is the eighth-note pulse; the felt beat is every second tick
    "ticks_per_beat": 2 if tempo > 120 else 1,
    "beats": [round(float(b), 3) for b in beats],
    "accent": [round(float(a), 2) for a in accent],
    "drop": drop, "quiet": quiet, "quiet_time": round(float(ot[qk]), 3), "end_hit": end_hit,
}
json.dump(music, open(OUT, "w"), indent=1)
print(f"tempo={tempo:.1f} BPM ({len(beats)} ticks, {music['ticks_per_beat']} per felt beat)  duration={dur:.2f}s")
print(f"drop=tick {drop} @ {beats[drop]:.3f}s  quiet=tick {quiet} @ {beats[quiet]:.3f}s  end_hit=tick {end_hit} @ {beats[end_hit]:.3f}s")
print("wrote", OUT)
