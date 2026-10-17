import numpy as np, subprocess, json, sys
W,H=180,320
res={}
for i in (1,2,3):
    raw=subprocess.run(["ffmpeg","-v","error","-i",f"/home/user/Cloud-/work/small{i}.mp4","-f","rawvideo","-pix_fmt","rgb24","-"],capture_output=True).stdout
    f=np.frombuffer(raw,np.uint8).reshape(-1,H,W,3).astype(np.float32)
    g=f.mean(3)
    n=len(g)
    mot=np.r_[0,np.abs(np.diff(g,axis=0)).mean((1,2))]
    lap=np.abs(g[:,1:-1,1:-1]*4-g[:,:-2,1:-1]-g[:,2:,1:-1]-g[:,1:-1,:-2]-g[:,1:-1,2:]).mean((1,2))
    con=g.std((1,2))
    sat=(f.max(3)-f.min(3)).mean((1,2))
    # center subject energy: detail in central region vs whole (framing)
    cen=np.abs(np.diff(g[:,80:240,40:140],axis=2)).mean((1,2))/(np.abs(np.diff(g,axis=2)).mean((1,2))+1e-3)
    res[i]=dict(n=n,mot=mot,lap=lap,con=con,sat=sat,cen=cen)
allm=np.concatenate([r["mot"] for r in res.values()]);alll=np.concatenate([r["lap"] for r in res.values()])
z=lambda x,a:(x-np.median(a))/(a.std()+1e-6)
cands=[]
for i,r in res.items():
    for s in range(0,r["n"]-30,8):
        sl=slice(s,s+30)
        m=r["mot"][sl].mean(); l=r["lap"][sl].mean()
        shake=r["mot"][sl].std()/(m+1e-3)
        blur=max(0,-z(l,alll))
        sc=1.2*np.clip(z(m,allm),-2,3)+1.0*z(l,alll)+0.02*r["con"][sl].mean()+0.01*r["sat"][sl].mean()+0.8*r["cen"][sl].mean()-0.6*blur-0.3*max(0,shake-1)
        if m<0.8: sc-=2  # static
        peak=s+int(np.argmax(r["mot"][sl]))
        cands.append(dict(clip=i,t=round(s/30,2),peak=round(peak/30,2),score=round(float(sc),3),motion=round(float(m),2),sharp=round(float(l),2)))
cands.sort(key=lambda c:-c["score"])
# NMS: no two picks within 1.5s of same clip
picked=[]
for c in cands:
    if all(not(p["clip"]==c["clip"] and abs(p["t"]-c["t"])<1.6) for p in picked): picked.append(c)
json.dump(picked,open("/home/user/Cloud-/work/cands.json","w"),indent=0)
for c in picked[:45]: print(c)
print({i:r["n"] for i,r in res.items()})
