import json, soundfile as sf, numpy as np
from faster_whisper import WhisperModel
audio, sr = sf.read("edit/work/voice16k.wav", dtype="float32")
m = WhisperModel("large-v3", device="cpu", compute_type="int8")
out = {}
for a, b in [(0.0, 3.1), (2.9, 6.9), (6.9, 14.0), (13.6, 16.25)]:
    seg = audio[int(a*sr):int(b*sr)]
    for lang, task in [("te","transcribe"), ("te","translate")]:
        segs, _ = m.transcribe(seg, language=lang, task=task, word_timestamps=True, beam_size=5,
                               condition_on_previous_text=False, no_speech_threshold=0.9)
        ws = [{"w": w.word, "s": round(w.start+a,3), "e": round(w.end+a,3), "p": round(w.probability,2)} for s in segs for w in s.words]
        out[f"{a}-{b}-{task}"] = ws
        print(f"[{a}-{b}] {task}: " + " ".join(f"{w['w'].strip()}[{w['s']:.2f}-{w['e']:.2f}|{w['p']}]" for w in ws))
json.dump(out, open("edit/work/transcript_regions.json","w"), ensure_ascii=False, indent=1)
