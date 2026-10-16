# Edit report: "Is Fabro's MOQ really high?" (9:16 Reel / Short / TikTok)

Source: `raw/DJI_20260807144306_0622_D.MP4`, downloaded from the shared Google Drive link. It is a DJI clip: 1728×3072 vertical HEVC 10-bit, 25 fps, 16.24 s, with one stereo AAC 48 kHz track.

Deliverables in `edit/`:
* `final.mp4`: 1080×1920, 60 fps, H.264 High (CRF 14), AAC-LC 320 kb/s, 48 kHz stereo. 351 frames / 5.850 s.
* `stems/voice.wav`, `stems/sfx.wav`, `stems/riser.wav`, `stems/music.wav`: 48 kHz stereo 32-bit float. Each is 280 800 samples (exactly END) and all start at 0, so they are sample-aligned with the video.

Everything is reproducible from `edit/scripts/` (Python) and `edit/hf/comps/` (HyperFrames).

---

## 1. END

**END = 5850 ms** (5.850 s = frame 351 at 60 fps, exclusive). The voice track and all stems end at exactly this point, and so do every video layer and the AAC stream.

## 2. Segment table (written before building the graphics; from `scripts/edl.py`)

| # | Start (ms) | End (ms) | Frames | Layout | Source range (camera) | Content |
|---|---|---|---|---|---|---|
| S1 | 0 | 3150 | 0–188 | **B. Split** | 7.78–10.93 s | Hook: "Chaala mandi Fabro lo MOQ ekkuva untadi anukunnaru" ("Many people think Fabro's MOQ is high"). Graphic: Fabro wordmark card, then a camera move to an MOQ order card where cartons stack up, then a "HIGH?" stamp. Camera card + cut-out head at the bottom. |
| S2 | 3150 | 4450 | 189–266 | **C. Fully visual** | (camera hidden) | "Vaalla kosame ee video" ("This video is for them"). A phone plays "this video": the cursor taps play, the window scales up 1.15×, and the progress bar starts. |
| S3 | 4450 | 5850 | 267–350 | **A. Full-screen camera** | 12.51–13.91 s | CTA: "Chivari varaku choodandi" ("Watch till the end"). You lean into the lens, with the comment-box CTA card. |

Checks:
* All three layouts are used, and no two consecutive segments share one.
* Every segment is ≤ 8 s (the longest is 3.15 s).
* The hook is split. The ending (CTA) is full-screen camera.
* All picture cuts are hard cuts on the 60 fps grid.

## 3. Takes, selection and substitutions

**Sync.** I cross-correlated the camera audio against the clean audio, both as mono 16 kHz. Offset **0 ms**, peak **1.000**, next-highest peak 0.041 (ratio 24.5×, an unambiguous peak).
*Caveat:* no separate clean-voice file was supplied. The camera track is the DJI wireless-mic feed (the mic is visible in your hand, and L and R are bit-identical), so I used it as the clean voice. That makes the correlation degenerate (a file against itself). It confirms the track is intact and in sync, but it doesn't measure a real offset. The camera's on-board mic audio didn't exist separately, so nothing from it is used.

**Transcription.** faster-whisper large-v3, Telugu, word timestamps. The small model produced garbage. I also ran an English translation pass to understand the content, and per-region passes to place word boundaries.

| Attempt | Source time | Words | Status |
|---|---|---|---|
| Room noise | 0.0–3.1 s | none (Whisper hallucinated "Hi everyone, welcome back…") | removed (no speech, −42 to −33 dB background) |
| **Take A** | 3.20–5.50 s | "Chaala mandi Fabro lo MOQ…" (stops after "MOQ") | **discarded**: restart mid-sentence |
| Breath / mutter | 6.2, 7.0 s | low-level, non-verbal | removed |
| **Take B** | 7.82–13.48 s | "Chaala mandi Fabro lo MOQ ekkuva untadi anukunnaru, vaalla kosame ee video chivari varaku choodandi." | **kept**: last complete take |
| Room noise | 13.9–16.2 s | none (Whisper hallucinated "cake / hand mixer") | removed |

* Sentences with no repeat: "vaalla kosame ee video…" and "chivari varaku choodandi" were only said once, inside take B.
* **Substitutions: none.** Take B has no audible defect, so no earlier take was used. Discarded take A content: *"Chaala mandi Fabro lo MOQ…"* (restart).

**Cut details (source → output):**
* B1 = source 7.78 → 12.10 s at full level (40 ms pre-roll before the onset at 7.82), then a 170 ms fade.
* The 400 ms pause between "video" (ends 12.10) and "chivari" (onset 12.50) was shortened to **120 ms**. B2 audio starts at output 4.400 s (source 12.46, 40 ms pre-roll). The picture cut is at **4.450 s**, so the audio pre-laps by 50 ms (J-cut).
* B1's tail (−36…−41 dB breath) fades over 170 ms under the start of B2. This is the "overlap the tails" option: the gap was never filled with silence.
* True end of the last sentence: the last 10 ms window at ≥ −35 dB is at source 13.47 s, and there is no earlier > 150 ms stretch below −32 dB. The tail stays at full level until it reaches the noise floor (13.74 s), then fades over 170 ms to END (source 13.91 s).
* Picture join S1 → S2 is at source 10.93 s, the word boundary between "anukunnaru" and "vaalla". I verified it by transcribing both sides: a cut at 10.67 s would have clipped "anukunnaru".
* Voice normalised to −14.0 LUFS integrated.

**Eye contact.** I inspected take B at 6 fps (≈ 38 frames) and the lean-in at 12.0–12.5 s at 100 ms intervals. You look into the lens for the whole take, including the lean-in. There is no look-away, so no segment needed splitting for gaze. S2 hides the camera for layout reasons only.

## 4. Graphic compositions (HyperFrames 0.8.166, one project per segment)

Shared look:
* Near-white radial background (#FFFFFF at 50 %/36 % → #F3F3F0).
* Three-layer shadows (60/120 .16, 24/48 .10, 4/10 .06).
* Poppins 400/700 for all graphics. No graphic text is smaller than 30 px.
* Terracotta #D97757 fills, #B25730 text, #FBEEE8 band, #FF3B30 stamp.

Animation engine (`hf/shared/engine.js`): every value is a pure function of time. The engine samples each value at 240 Hz and writes it as a paused-GSAP `tl.set` key, so renders are seek-deterministic. Frame 0 of every composition is at rest.

* **S1 (split, 3.15 s).**
  * The Fabro wordmark card (block, radius 72) sits at y 620–880 on frame 0, below the cover, and drifts gently (sine.inOut, +0.03 scale).
  * At 1.13 s, 0.25 s before "MOQ", a 0.5 s power3.inOut move pans 1200 px to the MOQ order card. During the move the logo card gets up to 14 px blur and 30 % less emphasis.
  * The card (y 80–880, bottom edge 880 in the 880–900 band) carries "MOQ" (96 px) and "Minimum order quantity" (30 px).
  * On "ekkuva" six cartons stack up, one every 0.12 s from 1.86 s. A red "HIGH?" stamp lands at 2.76 s. A gentle drift (+0.025) runs to the end.
  * The environment fades out from y 900 over 160 px.
* **S2 (fully visual, 1.30 s).**
  * Phone (radius 84, 470×900, bottom edge y 1215) showing a video card: "MOQ? / Fabro", "Full video / Tap to watch".
  * A cursor travels to play and taps at 0.62 s (just before "video"), with a ripple.
  * The phone window then scales 1.0 → 1.15 over 0.55 s, power2.inOut, while the environment camera is still (its 0.015 drift ends at 0.55 s). The play button resolves and the progress bar starts.
* **Overlay (5.85 s, 60 fps, ProRes 4444 alpha).** Cover (frame 0), captions, CTA card (below).
* **Split compositing** (FFmpeg):
  * Camera card 1210×864 at (−65, 1200), with 200 px superellipse corners (n = 4) and the three-layer shadow.
  * Vertical-source geometry: the 1728×3072 frame is scaled to 1210×2150 (exactly the card width) and placed at (−65, 570).
  * The head layer is the same frames with HyperFrames `remove-background` alpha, feathered 40 px across the card's top edge (y 1180–1220). Your hair breaks about 90–125 px above the card.
* **Motion blur.**
  * σ = 0.29 × on-screen camera speed × 0.75 / 60 (capped at 40 px), applied per 240 Hz sample as a CSS blur on the environment only. It is zero when the camera is still.
  * S1 and S2 were rendered at **240 fps**, then FFmpeg `tmix=frames=4` mixed each group of four and kept one frame per group, giving 60 fps.
  * The peak σ in S1 is ≈ 26 px mid-move. Rest frames are sharp; checked on frames 0, 72, 80, 85, 95 and 150.

Contact sheets of every composition were inspected before use (`hf/comps/*/.hyperframes/artifacts/snapshots/`).

## 5. Verified facts and sources

The speech contains **no numbers, dates, launches, quotes or headlines**. Its only claim is about perception ("many people *think* Fabro's MOQ is high"). So no source-page frame was needed and none is shown.

* "MOQ" = minimum order quantity (standard trade term).
* I searched for "Fabro" as a garment manufacturer or brand:
  * An IndiaMART listing exists for "Fabro Fashion" (Tiruppur), with no MOQ stated: https://m.indiamart.com/fabrofashion
  * A 2025 Tech Pack Genius list of low-MOQ Indian manufacturers names "Fabro Labels – Bangalore", but the page now returns 404 and its details couldn't be read: https://techpackgenius.com/50-low-moq-clothing-manufacturers-in-india-for-new-fashion-brands-2025-guide/
  * Neither source can be confirmed as the brand in the video. **No MOQ figure is shown anywhere in the graphics.**

## 6. Discrepancies between speech and sources

None measurable: the speech states no figure. Two things are unverified:
* Which company "Fabro" is. I treated it as your own brand or factory.
* The spelling. Whisper heard "Fabro"/"ఫేబ్రో" consistently, at 0.90–0.94 word confidence across five runs. An earlier project in this repo used the name "Hibro", so **please confirm the spelling**; it appears in the cover title and three graphics.

## 7. Sound effects (`stems/sfx.wav`, peaks relative to the voice peak of −1.57 dBFS)

| Time (s) | Effect | Visual event | Peak |
|---|---|---|---|
| 2.02, 2.14, 2.26, 2.38, 2.50, 2.62 | light tick sequence (one streaming event) | cartons land on the MOQ card | −16 dB (≈ −17.6 dBFS; panning adds ≤ 0.6 dB on one side) |
| 2.76 | muffled thump | "HIGH?" stamp lands | −10 dB (−11.5 dBFS) |
| 3.77 | soft click | tap on the play button | −10 dB (−11.5 dBFS) |

* **Whooshes: 0.** No whip moves were used, so none were placed.
* No effects on layout changes, drifts, the camera move, the window scale, the logo reveal or the CTA.

**Riser** (`stems/riser.wav`):
* Sine sweep 55 → 167 Hz plus band-passed noise rising 0.3 → 2.2 kHz.
* Audible from 0.654 s to **exactly 3.150 s**, the hook → first-point join, with a 5 ms anti-click ramp at the cut.
* Peak −15.6 dBFS (voice peak −14 dB).

**Music** (`stems/music.wav`):
* Original, 110 BPM, Am7–Fmaj7–G6–Em7.
* Warm detuned-saw pad (low-passed at 900 Hz), soft sub kick, sine bass, rim and hats. No lead melody, no vocals.
* First beat on frame 1 (16.7 ms). 5 ms ramp in, 800 ms fade-out, one static gain throughout: no ducking, no automation.

## 8. Loudness (FFmpeg `ebur128=peak=true`)

| Track | Integrated | True peak |
|---|---|---|
| voice.wav | **−14.0 LUFS** | −1.6 dBTP |
| sfx.wav | −28.3 LUFS | −11.5 dBTP |
| riser.wav | −25.0 LUFS | −15.6 dBTP |
| music.wav | **−24.0 LUFS** (10 LU under the voice) | −10.4 dBTP |
| master (WAV) | **−14.0 LUFS** | **−1.2 dBTP** |
| final.mp4 (AAC) | **−14.0 LUFS** | **−1.2 dBTP** |

Master: the four stems are summed without changing any stem level. The raw sum measured −13.4 LUFS, so a single −0.58 dB master-bus trim brought it to −14.0. After that the true peak was −1.2 dBTP, so **no limiter was needed**, and none was applied.

## 9. Reconstructions, fallbacks and decisions

* **Missing clean-voice file.** The camera's embedded wireless-mic track was used as the clean voice (see §3).
* **Fabro logo / interface.** No official logo or public product UI could be found. The **wordmark** (t-shirt glyph + "Fabro.") and the **MOQ order form** are reconstructions, not the brand's real assets. Replace them if a real logo exists.
* **Language and captions.** You speak Telugu. Poppins has no Telugu glyphs, so captions are **romanised Telugu** ("Chaala mandi", "MOQ ekkuva", …), timed from the final-track Whisper word timings. The **cover title is in English**, "Is Fabro's MOQ really high?", built from the hook. The cover box sits at y 262–603 (two lines, 110 px, radius 30 px ≈ 2.8 %), centred on the box coordinates you specified.
* **Highlight font.** Instrument Serif has no bold weight, so I used Instrument Serif Italic plus a 2.2 px same-colour stroke for the bold look: #FFFF00, 10 px black outline. Highlights are "MOQ ekkuva" and "chivari varaku", with 2 / 3 / 1 normal blocks between them and never two in a row.
* **Ending caption position.** The specified band (y 1037–1306) covers your mouth and chin in the lean-in. "Never cover the face" won, so the ending captions sit at y ≈ 1730, below the CTA card over your hands. S1 captions are at the 941–1114 gap; S2 captions are at the bottom zone.
* **CTA comment word.** Your CTA asks viewers to watch till the end and requests no comment word. The comment box types **"MOQ"** (the topic keyword) with a blinking caret, then the Post button is clicked and turns into a green check. No sound effects on the CTA.
* **Layout of "vaalla kosame ee video".** This line is addressed to the viewer, which would normally mean camera. It was given the fully visual layout because a 5.85 s video with three sentence parts needs all three layouts and no repeats.
* **Rendering.** HyperFrames renders the graphics. Its static-frame dedup reused frame 0 for frame 1 in the alpha overlay, so I re-rendered with `HF_STATIC_DEDUP=false`. The assembly was split into verified lossless intermediates after a single-graph version desynced. A 1/60 timebase mismatch that delayed the overlay by one frame was also fixed.
* **Never zoomed.** No zoom, push-in or movement was applied to the camera footage. The split card uses one fixed scale and position, and S3 is a straight scale to fill the frame.

## 10. Final check results

* **Format:** 1080×1920, 60/1 fps, 351 frames, H.264 High yuv420p BT.709; AAC 48 kHz stereo, 5.850 s. All layers end at END, with no trailing silence or leftover frames. ✔
* **Cuts:** both sides were checked at frames 188|189 and 266|267. The previous shot holds to its last planned frame and the new one starts on its first planned frame. ✔
* **Cover:** on frame 0 only (overlay alpha checked frame by frame). Frame 0 has no captions, and all intro graphics are below y 620. ✔
* **Head layer:**
  * Present on all 189 split frames, including frame 0.
  * Head pixels above the edge and card pixels below it match the same source frame within 0.6/255 on **every** split frame, including the five fastest-motion frames. No separation and no mask errors. ✔
  * The veil and shadow wrap-around bugs found on the first pass were fixed; above y 1000 the composite now matches the pure graphic.
* **Captions:** start at frame 1 (16.7 ms), one position per segment, clear of the face, the card edge and the graphics. Yellow highlights alternate correctly. ✔
* **Graphics:** within their safe areas, with no grids, spheres or dark areas. Motion blur appears only during camera movement. ✔
* **Audio:**
  * Each effect lands on its visual event. Zero whooshes, which is consistent with zero whip moves.
  * The riser ends at 3.150 s.
  * The longest pause between the first and last word is 110 ms below −35 dB (70 ms below −40 dB), and the join gap is 120 ms. Every join is under 150 ms.
  * Loudness targets are met exactly, and the true peak is −1.2 dBTP, within the −1 dBTP limit. ✔
