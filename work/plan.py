import json
B=json.load(open("/home/user/Cloud-/beats.json")); cands=json.load(open("cands.json"))
bt=[b["t"] for b in B["beats"]]
cuts=[0.0,1.788,2.995,4.087,5.294,6.455,7.523,8.777,10.008,10.635,11.262,11.889,12.516,13.142,13.769,14.396,15.023,15.650,16.277,17.508,18.762,20.016,20.643,21.269,21.896,22.523,23.150,23.777,24.404,25.031,26.0]
assert all(c in bt for c in cuts[:-1])
F=lambda t:round(t*30)
slow={6,7,19}   # 0-based slot idx at 0.5x
pattern=[1 if k%2==0 else (3 if k in (3,9,13,19,23) else 2) for k in range(30)]; pattern[28]=2; pattern[29]=1
pool={i:[c for c in cands if c["clip"]==i] for i in (1,2,3)}
used=[]
def take(clip,dur,want=None):
    lst=pool[clip]
    c=want or lst[0]
    lst.remove(c); return c
special={0:cands[0],10:cands[1],29:cands[2]}   # hook, biggest drop
for k,c in special.items():
    pattern[k]=c["clip"]; pool[c["clip"]].remove(c)
# fix back-to-back after overrides
for k in range(1,30):
    if pattern[k]==pattern[k-1]: pattern[k]=[x for x in (2,3,1) if x!=pattern[k-1] and (k+1>29 or x!=pattern[k+1])][0]
shots=[]
for k in range(30):
    a,b=F(cuts[k]),F(cuts[k+1]); n=b-a
    c=special.get(k) or pool[pattern[k]].pop(0)
    sp=0.5 if k in slow else 1.0
    srcn=round(n*sp)
    st=max(c["t"], c["peak"]-0.35*srcn/30)   # land the cut mid-action
    shots.append(dict(i=k,clip=c["clip"],src=round(st,3),out_a=a,out_b=b,frames=n,speed=sp,score=c["score"],motion=c["motion"]))
json.dump(shots,open("shots.json","w"),indent=1)
for s in shots: print(s)
