import numpy as np, soundfile as sf, sys
x, sr = sf.read("edit/work/cam_audio.wav"); x = x.mean(1)
def rms(t0, t1, step=0.01):
    out=[]
    t=t0
    while t<t1:
        s=x[int(t*sr):int((t+0.01)*sr)]; out.append((t, 20*np.log10(np.sqrt((s**2).mean())+1e-9))); t+=step
    return out
for a,b in [(7.5,8.0),(10.5,11.1),(11.8,12.6),(13.1,13.9)]:
    print("---",a,b)
    for t,v in rms(a,b): print(f"{t:.2f} {v:6.1f} "+"#"*int(max(0,(v+60)/1.5)))
