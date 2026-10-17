"""Synthesize sfx / riser / music stems (NumPy + SciPy), full length = END, 48 kHz stereo float."""
import sys, json; sys.path.insert(0, "edit/scripts")
import numpy as np, soundfile as sf, pyloudnorm as pyln
from scipy.signal import butter, sosfilt
from edl import END
SR = 48000; N = int(round(END * SR)); rng = np.random.default_rng(7)
t_all = np.arange(N) / SR
voice, _ = sf.read("edit/stems/voice.wav"); VPEAK = 20*np.log10(np.abs(voice).max())
def lp(x, f, o=2): return sosfilt(butter(o, f, "low", fs=SR, output="sos"), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, "high", fs=SR, output="sos"), x)
def bp(x, a, b, o=2): return sosfilt(butter(o, [a, b], "band", fs=SR, output="sos"), x)
def env_ad(n, a, d):  # attack / exp decay (seconds)
    t = np.arange(n)/SR; e = np.exp(-t/d); na = max(1, int(a*SR)); e[:na] *= np.linspace(0, 1, na); return e
def at_peak(x, db): return x / np.abs(x).max() * 10**(db/20)
def place(buf, x, t):  # stereo buf, mono or stereo x
    i = int(round(t*SR)); x = x if x.ndim == 2 else np.stack([x, x], 1)
    n = min(len(x), len(buf)-i); buf[i:i+n] += x[:n]
def pan(x, p): return np.stack([x*np.sqrt((1-p)/2), x*np.sqrt((1+p)/2)], 1) * np.sqrt(2)

# ---------- SFX ----------
def click():
    n = int(0.06*SR); t = np.arange(n)/SR
    body = np.sin(2*np.pi*1850*t) * env_ad(n, 0.0005, 0.006) + 0.6*np.sin(2*np.pi*3400*t) * env_ad(n, 0.0003, 0.003)
    tick = bp(rng.standard_normal(n), 2500, 7000) * env_ad(n, 0.0002, 0.0025)
    return lp(body + 0.5*tick, 9000)
def tick(f=2600):
    n = int(0.045*SR); t = np.arange(n)/SR
    return lp(np.sin(2*np.pi*f*t)*env_ad(n, 0.0004, 0.004) + 0.4*bp(rng.standard_normal(n), 3000, 8000)*env_ad(n, 0.0002, 0.002), 10000)
def thump():
    n = int(0.35*SR); t = np.arange(n)/SR
    f = 95*np.exp(-t/0.05) + 52; ph = 2*np.pi*np.cumsum(f)/SR
    x = np.sin(ph)*env_ad(n, 0.002, 0.09) + 0.25*lp(rng.standard_normal(n), 600)*env_ad(n, 0.001, 0.02)
    return lp(x, 900)
EVENTS = []
sfx = np.zeros((N, 2))
box_land = [1.86 + 0.12*i + 0.16 for i in range(6)]
for k, tb in enumerate(box_land):                      # light streaming sequence (cartons stacking)
    x = at_peak(tick(2300 + 180*k), VPEAK - 16); place(sfx, pan(x, -0.15 + 0.06*k), tb)
EVENTS.append(("stream ticks (6) - cartons stack on the MOQ card", box_land[0], box_land[-1], VPEAK - 16))
place(sfx, at_peak(thump(), VPEAK - 10), 2.76); EVENTS.append(("thump - 'HIGH?' stamp lands", 2.76, 2.76, VPEAK - 10))
place(sfx, at_peak(click(), VPEAK - 10), 3.15 + 0.62); EVENTS.append(("soft click - tap on play button", 3.77, 3.77, VPEAK - 10))
def key(k):
    n = int(0.05*SR); t = np.arange(n)/SR
    return lp(bp(rng.standard_normal(n), 1800 + 90*k, 6000)*env_ad(n, 0.0003, 0.006) + 0.5*np.sin(2*np.pi*(950+40*k)*t)*env_ad(n, 0.0005, 0.01), 9000)
def chime():
    n = int(0.9*SR); t = np.arange(n)/SR; x = np.zeros(n)
    for f, d in ((1318.5, 0.0), (1975.5, 0.11)):
        i = int(d*SR); tt = t[:n-i]
        x[i:] += (np.sin(2*np.pi*f*tt) + 0.25*np.sin(2*np.pi*2*f*tt)) * env_ad(n-i, 0.003, 0.28)
    return lp(x, 7000)
def whoosh(var):
    n = int(1.05*SR); t = np.arange(n)/SR; c = 0.525; nz = rng.standard_normal(n); x = np.zeros(n)
    for a in range(0, n, 1200):
        b = min(n, a+1200); u = (a/n); fc = [500, 650, 420, 560][var]*(1 + 3.2*np.exp(-((u-0.5)/0.18)**2))
        x[a:b] = bp(nz[max(0, a-2400):b], fc*0.5, min(fc*1.6, 20000))[-(b-a):]
    e = np.exp(-((t-c)/0.17)**2); return x*e      # envelope peak exactly at the centre of the move
S4, S5, S6 = 6.80, 12.80, 14.30
for i in range(9): place(sfx, pan(at_peak(key(i), VPEAK - 16), -0.1 + 0.025*i), S4 + 0.30 + i*0.08)
EVENTS.append(("key sequence (9) - 'Basic tee' typed in the Style field", S4 + 0.30, S4 + 0.30 + 8*0.08, VPEAK - 16))
for i, tc in enumerate((1.45, 1.65, 1.85, 2.05)):
    place(sfx, pan(at_peak(click(), VPEAK - 10), -0.2 + 0.13*i), S4 + tc)
    EVENTS.append((f"soft click - size chip {['S','M','L','XL'][i]} pressed", S4 + tc, S4 + tc, VPEAK - 10))
bt = [S4 + 3.30 + i*0.22 + 0.12 for i in range(4)]
for k, tb in enumerate(bt): place(sfx, pan(at_peak(tick(2100 + 200*k), VPEAK - 16), -0.15 + 0.1*k), tb)
EVENTS.append(("stream ticks (4) - quantity bars rise past the minimum line", bt[0], bt[-1], VPEAK - 16))
place(sfx, at_peak(chime(), VPEAK - 10), S4 + 5.05); EVENTS.append(("two-note chime - 'Ready to produce' confirmation", S4 + 5.05, S4 + 5.05, VPEAK - 10))
place(sfx, at_peak(thump(), VPEAK - 10), S5 + 0.62); EVENTS.append(("thump - 'MOQ ?' block lands", S5 + 0.62, S5 + 0.62, VPEAK - 10))
WMID = S6 + 0.825   # whip: 0.30-0.75 exit (power3.in) + 0.75-1.35 arrival (power3.out); temporal middle = 0.825
w = at_peak(whoosh(0), VPEAK - 9); place(sfx, pan(w, 0), WMID - 0.525)
EVENTS.append(("whoosh (variation 1 of 4) - whip to the Fabro wordmark, peak at move middle", WMID, WMID, VPEAK - 9))

# ---------- RISER (audible end exactly at the hook join 3.15 s) ----------
J1 = 3.15; RL = 2.6; n = int(round(RL*SR)); t = np.arange(n)/SR; p = t/RL
f0 = 55*2**(1.6*p**1.5)                                  # 55 Hz -> ~167 Hz
tone = np.sin(2*np.pi*np.cumsum(f0)/SR) + 0.35*np.sin(2*np.pi*np.cumsum(2*f0)/SR)
noise = np.zeros(n); nz = rng.standard_normal(n)
for a in range(0, n, 2400):                              # noise band rising 300 Hz -> 2.2 kHz
    b = min(n, a+2400); fc = 300 + 1900*(a/n)**2; noise[a:b] = bp(nz[max(0,a-4800):b], fc*0.6, fc*1.4)[-(b-a):]
r = (tone + 0.5*noise) * (p**2.2)
r[-int(0.005*SR):] *= np.linspace(1, 0, int(0.005*SR))  # 5 ms anti-click at the cut
riser = np.zeros((N, 2)); place(riser, pan(at_peak(lp(r, 4000), VPEAK - 14), 0), J1 - RL)

# ---------- MUSIC: 110 BPM, warm minimal electronic, first beat on frame 1 ----------
BPM = 110; beat = 60/BPM; T0 = 1/60
mus = np.zeros((N, 2))
def kick():
    n = int(0.4*SR); t = np.arange(n)/SR; f = 48 + 70*np.exp(-t/0.03)
    return np.sin(2*np.pi*np.cumsum(f)/SR) * env_ad(n, 0.001, 0.16)
def hat():
    n = int(0.08*SR); return hp(rng.standard_normal(n), 7000) * env_ad(n, 0.0005, 0.018)
def rim():
    n = int(0.12*SR); t = np.arange(n)/SR
    return (np.sin(2*np.pi*820*t)*0.5 + bp(rng.standard_normal(n), 1200, 5000)) * env_ad(n, 0.0005, 0.03)
def pad(freqs, dur):
    n = int(dur*SR); t = np.arange(n)/SR; x = np.zeros((n, 2))
    for i, f in enumerate(freqs):
        for d, side in ((-0.004, 0), (0.004, 1)):          # detuned saws, one per side (warm stereo)
            ff = f*(1+d); saw = 2*((t*ff) % 1) - 1
            x[:, side] += saw
    x = np.stack([lp(x[:, 0], 900, 4), lp(x[:, 1], 900, 4)], 1)
    e = np.minimum(1, t/0.12) * np.minimum(1, (dur - t)/0.25).clip(0, 1); return x * e[:, None]
def bass(f, dur):
    n = int(dur*SR); t = np.arange(n)/SR
    x = np.sin(2*np.pi*f*t) + 0.2*np.sin(2*np.pi*2*f*t); return lp(x, 300) * np.minimum(1, t/0.01) * np.exp(-t/0.6)
chords = [[220.0, 261.63, 329.63, 392.0], [174.61, 220.0, 261.63, 329.63], [196.0, 246.94, 293.66, 392.0], [164.81, 196.0, 246.94, 329.63]]  # Am7 Fmaj7 G6 Em7
roots = [55.0, 43.65, 49.0, 41.2]
nbeats = int((END - T0)/beat) + 2
for b in range(nbeats):
    tb = T0 + b*beat
    if tb >= END: break
    place(mus, kick()*0.9, tb)
    place(mus, pan(hat()*0.22, 0.3), tb + beat/2)
    if b % 4 in (1, 3): place(mus, pan(rim()*0.18, -0.2), tb)
    if b % 4 == 0:
        c = (b//4) % 4; place(mus, pad(chords[c], beat*4)*0.07, tb)
    place(mus, bass(roots[((b//4) % 4)], beat*0.9)*0.35, tb)
    if tb >= 5.85 - 1e-6 and tb < END - 1.0:          # instrumental section: soft plucked arpeggio (no voice to compete with)
        c = chords[(b//4) % 4]
        for j in range(2):
            f = c[(2*b + j) % 4] * 2; n2 = int(0.3*SR); t2 = np.arange(n2)/SR
            pl = lp((np.sin(2*np.pi*f*t2) + 0.3*np.sin(2*np.pi*2*f*t2)) * env_ad(n2, 0.002, 0.09), 2500)
            place(mus, pan(pl*0.05, -0.35 if j == 0 else 0.35), tb + j*beat/2)
# no fade-in beyond a 5 ms ramp; 800 ms fade-out; one static gain (no automation)
ramp = int(0.005*SR); mus[:ramp] *= np.linspace(0, 1, ramp)[:, None]
fo = int(0.8*SR); mus[-fo:] *= np.linspace(1, 0, fo)[:, None]
meter = pyln.Meter(SR); L = meter.integrated_loudness(mus); mus *= 10**((-24.0 - L)/20)

for name, x in (("sfx", sfx), ("riser", riser), ("music", mus)):
    assert len(x) == N
    sf.write(f"edit/stems/{name}.wav", x.astype(np.float32), SR, subtype="FLOAT")
json.dump({"voice_peak_dbfs": VPEAK, "events": EVENTS, "riser": [J1 - RL, J1], "music_first_beat": T0, "bpm": BPM},
          open("edit/work/audio_events.json", "w"), indent=1)
print("voice peak %.2f dBFS; music pre-gain %.2f LUFS" % (VPEAK, L)); print(EVENTS)
