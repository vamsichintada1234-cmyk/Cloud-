import numpy as np, soundfile as sf, json
from scipy.signal import resample_poly
st = {k: sf.read(f"edit/stems/{k}.wav")[0] for k in ("voice", "sfx", "riser", "music")}
SR = 48000; m = sum(st.values())                       # straight sum, no per-stem readjustment
import pyloudnorm as pyln
L0 = pyln.Meter(SR).integrated_loudness(m); trim = -14.0 - L0   # one master-bus trim to -14 LUFS
m = m * 10**(trim/20)
def tp(x): return 20*np.log10(np.abs(resample_poly(x, 4, 1, axis=0)).max())
before = tp(m); lim = False; CEIL = -1.0
if before > CEIL - 0.1:
    # transparent look-ahead limiter on the 4x-oversampled signal (gain computed once, smooth release)
    lim = True; up = resample_poly(m, 4, 1, axis=0); c = 10**((CEIL-0.2)/20)
    peak = np.abs(up).max(1); g = np.minimum(1, c/np.maximum(peak, 1e-9))
    la = int(0.005*SR*4); rel = np.exp(-1/(0.08*SR*4))
    gmin = np.array([g[max(0,i-la):i+la+1].min() for i in range(0, len(g))]) if len(g) < 0 else None
    from scipy.ndimage import minimum_filter1d
    gm = minimum_filter1d(g, 2*la+1); out = np.empty_like(gm); s = 1.0
    for i in range(len(gm)):
        s = gm[i] if gm[i] < s else gm[i] + (s - gm[i])*rel; out[i] = s
    up *= out[:, None]; m = resample_poly(up, 1, 4, axis=0)[:len(m)]
after = tp(m)
sf.write("edit/work/master.wav", m.astype(np.float32), SR, subtype="FLOAT")
json.dump({"sum_lufs": L0, "master_trim_db": trim, "tp_before": before, "tp_after": after, "limiter": lim}, open("edit/work/master.json", "w"))
print("sum %.2f LUFS trim %+.2f dB; " % (L0, trim) + "TP before %.2f after %.2f limiter=%s" % (before, after, lim))
