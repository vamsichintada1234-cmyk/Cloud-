"""Single source of truth for the cut: source/output times (seconds). Output frame grid = 1/60 s."""
FPS = 60
SRC = "raw/DJI_20260807144306_0622_D.MP4"
# Audio pieces from the clean voice (take B, the last complete take).
# keep = full-level region, fade = 170 ms fade-out after it, out = placement on the output timeline.
PIECES = [
    dict(name="B1", src_in=7.78, src_full_end=12.10, fade=0.17, out=0.00),   # "chaala mandi ... ee video"
    dict(name="B2", src_in=12.46, src_full_end=13.74, fade=0.17, out=4.40),  # "chivari varaku choodandi"
]
END = 5.85            # exclusive end of the voice track (= 351 frames @60)
# Picture segments (hard cuts on the 60 fps grid)
SEGMENTS = [
    dict(id="S1", start=0.00, end=3.15, layout="B", src_in=7.78,
         content="Hook - 'Chaala mandi Fabro lo MOQ ekkuva untadi anukunnaru' : Fabro wordmark card -> MOQ order card, stack of garment cartons growing"),
    dict(id="S2", start=3.15, end=4.45, layout="C", src_in=None,
         content="'Vaalla kosame ee video' : phone arrives, tap on play -> this video starts playing"),
    dict(id="S3", start=4.45, end=END, layout="A", src_in=12.51,
         content="CTA - 'Chivari varaku choodandi' : full-screen camera (lean-in) + comment-box CTA card"),
]
# Final-track word timings (output seconds), from Whisper large-v3 on the cut boundaries + RMS onsets.
WORDS = [
    ("Chaala", 0.04, 0.36), ("mandi", 0.36, 0.68), ("Fabro", 0.68, 1.16), ("lo", 1.16, 1.38),
    ("MOQ", 1.38, 1.92), ("ekkuva", 1.92, 2.16), ("untadi", 2.16, 2.40), ("anukunnaru", 2.40, 3.12),
    ("vaalla", 3.15, 3.45), ("kosame", 3.45, 3.76), ("ee", 3.76, 3.90), ("video", 3.90, 4.32),
    ("chivari", 4.44, 4.78), ("varaku", 4.78, 4.92), ("choodandi", 4.92, 5.42),
]
