import json, sys
sys.path.insert(0, "/home/user/Cloud-/edit/scripts")
from edl import END
# caption blocks: (start, end, [(word, highlight)], segment)
F = 1/60
BLOCKS = [
    (F,    0.68, [("Chaala",0),("mandi",0)], "S1"),
    (0.68, 1.38, [("Fabro",0),("lo",0)], "S1"),
    (1.38, 2.16, [("MOQ",1),("ekkuva",1)], "S1"),
    (2.16, 3.15, [("untadi",0),("anukunnaru",0)], "S1"),
    (3.15, 3.76, [("vaalla",0),("kosame",0)], "S2"),
    (3.76, 4.45, [("ee",0),("video",0)], "S2"),
    (4.45, 4.92, [("chivari",1),("varaku",1)], "S3"),
    (4.92, 5.85, [("choodandi",0)], "S3"),
]
CY = {"S1": 1027, "S2": 1400, "S3": 1400}   # split gap 941-1114 / bottom 1267-1536 (S3: chin ends ~1150, CTA card now lives in S6)
html = []
for i, (a, b, ws, seg) in enumerate(BLOCKS):
    spans = " ".join(f'<span class="{"hl" if h else "nm"}">{w}</span>' for w, h in ws)
    html.append(f'<div class="cap" id="cap{i}" style="top:{CY[seg]}px"><div class="stroke">{spans}</div><div class="fill">{spans}</div></div>')
open("blocks.json","w").write(json.dumps([[a,b] for a,b,_,_ in BLOCKS]))
src = open("template.html").read().replace("%%CAPTIONS%%", "\n    ".join(html)).replace("%%END%%", f"{END:.2f}") \
      .replace("%%BLOCKS%%", json.dumps([[round(a,4),round(b,4)] for a,b,_,_ in BLOCKS]))
open("index.html","w").write(src)
