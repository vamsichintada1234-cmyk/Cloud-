import numpy as np, soundfile as sf, sys
x, sr = sf.read(sys.argv[1]); x = x.mean(1) if x.ndim>1 else x
h = int(sr*0.01); n = len(x)//h
rms = 20*np.log10(np.sqrt((x[:n*h].reshape(n,h)**2).mean(1))+1e-9)
print("floor p10 %.1f median %.1f max %.1f" % (np.percentile(rms,10), np.median(rms), rms.max()))
# print 100ms resolution bar
for i in range(0, n, 10):
    v = rms[i:i+10].max()
    print(f"{i/100:5.1f} {v:6.1f} " + "#"*int(max(0,(v+60)/1.5)))
