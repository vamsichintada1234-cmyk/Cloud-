"""Step 1: cross-correlate camera audio vs. clean voice (both mono 16 kHz)."""
import numpy as np, soundfile as sf, subprocess, json, sys
from scipy.signal import correlate
cam_src, clean_src, out = sys.argv[1], sys.argv[2], sys.argv[3]
def load(src, tag):
    p = f"edit/work/sync_{tag}.wav"
    subprocess.run(["ffmpeg","-v","error","-y","-i",src,"-map","0:a:0","-ac","1","-ar","16000",p], check=True)
    x, _ = sf.read(p); return (x - x.mean()) / (x.std() + 1e-12)
a, b = load(cam_src, "cam"), load(clean_src, "clean")
c = correlate(a, b, mode="full", method="fft") / min(len(a), len(b))
lags = np.arange(-len(b)+1, len(a))
i = int(np.argmax(np.abs(c))); peak = float(c[i]); lag = int(lags[i])
mask = np.abs(lags - lag) > 1600          # exclude +-100 ms around the peak
second = float(np.abs(c[mask]).max())
res = {"offset_samples_16k": lag, "offset_ms": lag / 16.0, "peak": peak, "second_peak": second,
       "peak_ratio": abs(peak) / second}
json.dump(res, open(out, "w"), indent=1); print(res)
