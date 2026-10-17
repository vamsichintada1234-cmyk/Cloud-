import json,re,html
S=json.load(open("shots.json")); B=json.load(open("/home/user/Cloud-/beats.json"))
off=B["window_start"]; down={round(b["t"]*30):b["downbeat"] for b in B["beats"]}
DROPS={338,600}
fx=[]; rot=["punch","whip"]; r=0
for s in S[1:]:
    f=s["out_a"]
    if f in DROPS: kind="flash"
    elif down.get(f): kind="shake"
    else: kind=rot[r%2]; r+=1
    fx.append(dict(frame=f,t=round(f/30,3),kind=kind))
# extra shakes on strong onsets that fall mid-shot (downbeat accents), and hook punch
extra=[dict(frame=0,t=0,kind="punch")]
# subtitles
srt=open("/home/user/Cloud-/input/Audio.srt.txt",encoding="utf-8").read().strip()
subs=[]
ts=lambda h,m,s,ms:int(h)*3600+int(m)*60+int(s)+int(ms)/1000
for blk in re.split(r"\n\s*\n",srt):
    L=blk.strip().splitlines()
    m=re.findall(r"(\d+):(\d+):(\d+),(\d+)",L[1]); a,b=ts(*m[0])-off,ts(*m[1])-off
    a=max(0,a); b=min(26,b)
    if b-a>0.1: subs.append(dict(a=round(a,3),b=round(b,3),text=" ".join(L[2:])))
json.dump(dict(cuts=fx,extra=extra,subs=subs),open("fx.json","w"),indent=1,ensure_ascii=False)
subhtml="\n".join(f'      <div id="sub{i}" class="clip sub" data-start="{s["a"]}" data-duration="{round(s["b"]-s["a"],3)}" data-track-index="3"><span>{html.escape(s["text"])}</span></div>' for i,s in enumerate(subs))
kb="\n".join(f'      tl.fromTo("#kb",{{scale:1}},{{scale:1.08,duration:{round(s["frames"]/30,3)},ease:"none",immediateRender:false}},{round(s["out_a"]/30,4)});' for s in S)
F=1/30
lines=[]
for e in fx+extra:
    t=e["t"]
    if e["kind"] in("punch",):
        lines.append(f'tl.fromTo("#punch",{{scale:1}},{{scale:1.15,duration:{3*F:.4f},ease:"power2.out",immediateRender:false}},{t});tl.to("#punch",{{scale:1,duration:{8*F:.4f},ease:"power1.inOut"}},{t+3*F:.4f});')
    if e["kind"] in("shake","flash"):
        seq=[(12,-1.2),(-10,1.0),(9,-0.8),(-6,0.5),(3,-0.2),(0,0)]
        for j,(dx,rt) in enumerate(seq):
            dy=-dx*0.6
            lines.append(f'tl.set("#shake",{{x:{dx},y:{dy:.1f},rotation:{rt}}},{t+j*F:.4f});')
    if e["kind"]=="flash":
        lines.append(f'tl.set("#flash",{{opacity:1}},{t});tl.set("#flash",{{opacity:0.55}},{t+F:.4f});tl.set("#flash",{{opacity:0}},{t+2*F:.4f});')
        lines.append(f'tl.fromTo("#punch",{{scale:1.12}},{{scale:1,duration:{6*F:.4f},ease:"power2.out",immediateRender:false}},{t});')
    if e["kind"]=="whip":
        a=t-2*F
        lines.append(f'tl.fromTo("#whip",{{filter:"blur(0px)",y:0,scale:1}},{{filter:"blur(16px)",y:-70,scale:1.1,duration:{2*F:.4f},ease:"power2.in",immediateRender:false}},{a:.4f});')
        lines.append(f'tl.fromTo("#whip",{{filter:"blur(16px)",y:70,scale:1.1}},{{filter:"blur(0px)",y:0,scale:1,duration:{3*F:.4f},ease:"power2.out",immediateRender:false}},{t:.4f});')
subanim="\n".join(f'      tl.fromTo("#sub{i} span",{{scale:0.6,opacity:0}},{{scale:1,opacity:1,duration:0.18,ease:"back.out(2.5)",immediateRender:false}},{s["a"]});' for i,s in enumerate(subs))
doc=f'''<!doctype html>
<html lang="te" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face {{ font-family: "ReelTelugu"; src: url("fonts/NotoSansTelugu.ttf") format("truetype"); font-weight: 900; }}
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: #000; }}
      #root {{ position: relative; width: 1080px; height: 1920px; overflow: hidden; }}
      .layer {{ position: absolute; inset: 0; transform-origin: 50% 50%; }}
      #shake {{ inset: -40px; }}
      #base {{ position: absolute; left: 40px; top: 40px; width: 1080px; height: 1920px; object-fit: cover; }}
      #flash {{ position: absolute; inset: 0; background: #fff; opacity: 0; mix-blend-mode: screen; }}
      .sub {{ position: absolute; left: 60px; right: 60px; top: 1290px; height: 360px; display: flex; align-items: center; justify-content: center; text-align: center; }}
      .sub span {{ display: inline-block; font-family: "ReelTelugu", "Arial Black", sans-serif; font-weight: 900; font-size: 66px; line-height: 1.35; color: #fff;
        -webkit-text-stroke: 5px #000; paint-order: stroke fill; text-shadow: 0 6px 18px rgba(0,0,0,.55); transform-origin: 50% 60%; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="26" data-width="1080" data-height="1920">
      <audio id="music" src="music.m4a" class="clip" data-start="0" data-duration="26" data-track-index="1"></audio>
      <div id="stage" style="position:absolute;inset:0;">
        <div id="shake" class="layer"><div id="punch" class="layer"><div id="whip" class="layer"><div id="kb" class="layer">
          <video id="base" src="base.mp4" muted playsinline class="clip" data-start="0" data-duration="26" data-media-start="0" data-track-index="0"></video>
        </div></div></div></div>
      </div>
      <div id="flash" class="clip" data-start="0" data-duration="26" data-track-index="2"></div>
{subhtml}
    </div>
    <script>
      window.__timelines = window.__timelines || {{}};
      const tl = gsap.timeline({{ paused: true }});
{kb}
      {chr(10).join("      "+l for l in lines)}
{subanim}
      tl.set({{}}, {{}}, 26);
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
'''
open("reel/index.html","w",encoding="utf-8").write(doc)
for e in fx: print(e)
for s in subs: print(s)
