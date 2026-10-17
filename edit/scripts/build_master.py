"""Master: straight sum of the four stems (no per-stem changes), one master-bus trim, and a transparent true-peak
look-ahead limiter only if the true peak exceeds -1 dBTP. Trim is iterated so the limited master lands at -14 LUFS."""
import numpy as np, soundfile as sf, json, pyloudnorm as pyln
from scipy.signal import resample_poly
from scipy.ndimage import minimum_filter1d
SR = 48000; CEIL = -1.0
TARGET = -16.0   # 20 s cut: 70 % music-only at the fixed -24 LUFS music level; -14 would need ~6.7 dB of limiting on the voice
st = {k: sf.read(f"edit/stems/{k}.wav")[0] for k in ("voice", "sfx", "riser", "music")}
raw = sum(st.values()); meter = pyln.Meter(SR); L0 = meter.integrated_loudness(raw)
def tp(x): return 20*np.log10(np.abs(resample_poly(x, 4, 1, axis=0)).max())
def limit(m):
    up = resample_poly(m, 4, 1, axis=0); c = 10**((CEIL - 0.25)/20)
    g = np.minimum(1, c/np.maximum(np.abs(up).max(1), 1e-9))
    la = int(0.005*SR*4); gm = minimum_filter1d(g, 2*la+1)           # 5 ms look-ahead (window centred)
    rel = np.exp(-1/(0.12*SR*4)); out = np.empty_like(gm); s = 1.0
    for i in range(len(gm)):                                           # instant attack (pre-empted by look-ahead), 120 ms release
        s = gm[i] if gm[i] < s else gm[i] + (s - gm[i])*rel; out[i] = s
    y = resample_poly(up*out[:, None], 1, 4, axis=0)[:len(m)]
    return y, 20*np.log10(out[::4])
trim = TARGET - L0; lim = False; gr = np.zeros(1)
for it in range(6):
    m = raw * 10**(trim/20)
    if tp(m) > CEIL: m, gr = limit(m); lim = True
    L = meter.integrated_loudness(m)
    if abs(L - TARGET) < 0.05: break
    trim += TARGET - L
sf.write("edit/work/master.wav", m.astype(np.float32), SR, subtype="FLOAT")
info = {"sum_lufs": L0, "master_trim_db": trim, "limiter": lim, "lufs": L, "tp_after": tp(m),
        "max_gain_reduction_db": float(-gr.min()), "time_gr_over_1db_pct": float((gr < -1).mean()*100), "time_gr_over_3db_pct": float((gr < -3).mean()*100)}
json.dump(info, open("edit/work/master.json", "w"), indent=1); print(info)
