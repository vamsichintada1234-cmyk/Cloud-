"""Single source of truth for the cut: source/output times (seconds). Output frame grid = 1/60 s."""
FPS = 60
SRC = "raw/DJI_20260807144306_0622_D.MP4"
# Audio pieces from the clean voice (take B, the last complete take).
# keep = full-level region, fade = 170 ms fade-out after it, out = placement on the output timeline.
PIECES = [
    dict(name="B1", src_in=7.78, src_full_end=12.10, fade=0.17, out=0.00),   # "chaala mandi ... ee video"
    dict(name="B2", src_in=12.46, src_full_end=13.74, fade=0.17, out=4.40),  # "chivari varaku choodandi"
]
VOICE_END = 5.85      # end of the edited speech (B2 fade-out ends here)
END = 20.00           # exclusive end of the video and of every stem (= 1200 frames @60); 5.85-20.00 is music-led
# Picture segments (hard cuts on the 60 fps grid)
SEGMENTS = [
    dict(id="S1", start=0.00, end=3.15, layout="B", src_in=7.78,
         content="Hook - 'Chaala mandi Fabro lo MOQ ekkuva untadi anukunnaru' : Fabro wordmark card -> MOQ order card, cartons stack, 'HIGH?' stamp"),
    dict(id="S2", start=3.15, end=4.45, layout="C", src_in=None,
         content="'Vaalla kosame ee video' : phone, tap on play -> this video starts playing"),
    dict(id="S3", start=4.45, end=6.80, layout="A", src_in=12.51,
         content="CTA - 'Chivari varaku choodandi' (lean-in) + 0.95 s held look into the lens (silent, music)"),
    dict(id="S4", start=6.80, end=12.80, layout="C", src_in=None,
         content="How MOQ works (music): order form - style typed, sizes picked, per-size quantity bars fill to the minimum line, 'Ready to produce' check"),
    dict(id="S5", start=12.80, end=14.30, layout="B", src_in=0.70,
         content="Split: standing shot at the lens (silent) under the Fabro wordmark block"),
    dict(id="S6", start=14.30, end=END, layout="C", src_in=None,
         content="End: whip to the Fabro wordmark, then the comment-box CTA types 'MOQ' and clicks Post"),
]
# Final-track word timings (output seconds), from Whisper large-v3 on the cut boundaries + RMS onsets.
WORDS = [
    ("Chaala", 0.04, 0.36), ("mandi", 0.36, 0.68), ("Fabro", 0.68, 1.16), ("lo", 1.16, 1.38),
    ("MOQ", 1.38, 1.92), ("ekkuva", 1.92, 2.16), ("untadi", 2.16, 2.40), ("anukunnaru", 2.40, 3.12),
    ("vaalla", 3.15, 3.45), ("kosame", 3.45, 3.76), ("ee", 3.76, 3.90), ("video", 3.90, 4.32),
    ("chivari", 4.44, 4.78), ("varaku", 4.78, 4.92), ("choodandi", 4.92, 5.42),
]
