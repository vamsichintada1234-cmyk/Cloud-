import sys, json
from faster_whisper import WhisperModel
src, out, size = sys.argv[1], sys.argv[2], sys.argv[3]
m = WhisperModel(size, device="cpu", compute_type="int8")
import soundfile as sf
audio, _ = sf.read(src, dtype="float32")
segs, info = m.transcribe(audio, word_timestamps=True, beam_size=5, vad_filter=False,
                          condition_on_previous_text=False)
res = {"language": info.language, "prob": info.language_probability, "segments": []}
for s in segs:
    res["segments"].append({"start": s.start, "end": s.end, "text": s.text,
        "words": [{"w": w.word, "s": w.start, "e": w.end, "p": w.probability} for w in s.words]})
json.dump(res, open(out, "w"), indent=1, ensure_ascii=False)
print(info.language, info.language_probability)
for s in res["segments"]:
    print(f"{s['start']:6.2f}-{s['end']:6.2f} {s['text']}")
    print("   ", " ".join(f"{w['w'].strip()}[{w['s']:.2f}-{w['e']:.2f}|{w['p']:.2f}]" for w in s["words"]))
