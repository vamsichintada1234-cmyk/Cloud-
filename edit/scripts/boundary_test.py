import soundfile as sf
from faster_whisper import WhisperModel
a, sr = sf.read("edit/work/voice16k.wav", dtype="float32")
m = WhisperModel("large-v3", device="cpu", compute_type="int8")
for s,e in [(7.78,10.67),(10.67,12.12),(7.78,10.92),(10.92,12.12),(12.46,13.91)]:
    segs,_ = m.transcribe(a[int(s*sr):int(e*sr)], language="te", beam_size=5, word_timestamps=True, condition_on_previous_text=False)
    print(s,e,"|", " ".join(f"{w.word.strip()}[{w.start+s:.2f}-{w.end+s:.2f}]" for g in segs for w in g.words), flush=True)
