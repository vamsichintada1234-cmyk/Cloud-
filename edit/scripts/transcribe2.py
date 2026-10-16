import sys, json, soundfile as sf
from faster_whisper import WhisperModel
src, out = sys.argv[1], sys.argv[2]
audio, _ = sf.read(src, dtype="float32")
m = WhisperModel("large-v3", device="cpu", compute_type="int8")
res = {}
for lang, task in [("te","transcribe"), (None,"translate"), ("en","transcribe")]:
    segs, info = m.transcribe(audio, language=lang, task=task, word_timestamps=True, beam_size=5,
                              condition_on_previous_text=False)
    segs = list(segs)
    key = f"{lang}_{task}"
    res[key] = [{"start": s.start, "end": s.end, "text": s.text,
                 "words": [{"w": w.word, "s": w.start, "e": w.end, "p": w.probability} for w in s.words]} for s in segs]
    print("==", key, info.language, round(info.language_probability,2))
    for s in res[key]:
        print(f"{s['start']:6.2f}-{s['end']:6.2f} {s['text']}")
        print("   ", " ".join(f"{w['w'].strip()}[{w['s']:.2f}-{w['e']:.2f}|{w['p']:.2f}]" for w in s["words"]))
json.dump(res, open(out, "w"), indent=1, ensure_ascii=False)
