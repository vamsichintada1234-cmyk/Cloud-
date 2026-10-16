import subprocess, numpy as np
W,H=1210,2150
p = subprocess.run(["ffmpeg","-v","error","-i","edit/work/split_cutout.mov","-vf","alphaextract,format=gray","-f","rawvideo","-"],capture_output=True)
a = np.frombuffer(p.stdout,np.uint8).reshape(-1,H,W)
print("frames",len(a))
for i in range(0,len(a),5):
    rows = np.where((a[i]>128).sum(1)>20)[0]
    cols = np.where((a[i][:1100]>128).sum(0)>5)[0]
    print(f"f{i:3d} src={7.6+i/25:.2f} top={rows.min() if len(rows) else -1} x={cols.min()}-{cols.max()} cover={(a[i]>128).mean():.2f}")
