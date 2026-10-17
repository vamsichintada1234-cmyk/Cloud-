import sys; sys.path.insert(0, "edit/scripts")
import numpy as np, soundfile as sf, pyloudnorm as pyln
from edl import PIECES, END
x, sr = sf.read("edit/work/clean_voice.wav")           # 48 kHz stereo (dual mono)
x = x.mean(1)
N = int(round(END * sr)); out = np.zeros(N)   # voice ends at VOICE_END, silence after
for p in PIECES:
    a = int(round(p["src_in"] * sr)); f0 = int(round(p["src_full_end"] * sr)); fl = int(round(p["fade"] * sr))
    seg = x[a:f0 + fl].copy()
    env = np.ones(len(seg)); env[:int(0.003*sr)] = np.linspace(0, 1, int(0.003*sr))   # 3 ms anti-click
    env[len(seg)-fl:] = 0.5 * (1 + np.cos(np.linspace(0, np.pi, fl)))                 # 170 ms fade-out
    o = int(round(p["out"] * sr)); seg = (seg * env)[:N - o]
    out[o:o + len(seg)] += seg
    print(p["name"], "out", p["out"], "->", round(p["out"] + len(seg)/sr, 4))
meter = pyln.Meter(sr)
L = meter.integrated_loudness(np.stack([out, out], 1))
g = 10 ** ((-14.0 - L) / 20); out *= g
print("measured %.2f LUFS, gain %+.2f dB, sample peak %.2f dBFS" % (L, 20*np.log10(g), 20*np.log10(np.abs(out).max())))
sf.write("edit/stems/voice.wav", np.stack([out, out], 1).astype(np.float32), sr, subtype="FLOAT")
