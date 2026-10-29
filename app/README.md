# RefCut — edit raw clips like a reference video

Upload one **reference video** (an edit you like) and your **raw clips**. RefCut studies the reference and
re-cuts your clips in the same style, then lets you fix anything in a timeline editor.

## Run

Needs Node 18+ and `ffmpeg`/`ffprobe` on the PATH. No npm packages.

```bash
npm run app            # or: node app/server.js
# open http://localhost:5173  (on a phone on the same Wi-Fi: http://<computer-ip>:5173)
```

Env: `PORT` (default 5173), `REFCUT_DATA` (project storage, default `app/data/`).

## Flow

1. **Start Your Editing** → upload the reference video, type how many clips (e.g. 5) → that many numbered boxes
   appear; put clip 1 in box 1, clip 2 in box 2, …
2. **Edit** → analysis + automatic edit + render. The output plays with a download button.
3. **Editor** tab → every shot is on a timeline. Per shot: change clip, start point in the clip, length (drag the
   right edge; it snaps to the reference's cut points), speed, zoom / move the frame (drag on the preview, scroll or
   pinch to zoom), flip, colour, transition to the next shot, the clip's own sound. Split / duplicate / reorder /
   delete shots, undo/redo, then **Quick render** (half-res) or **Render final**. Every render is kept as a version.

Keys in the editor: Space play, S split, ←/→ frame step (Shift = 1 s), Delete, Ctrl+Z / Ctrl+Shift+Z.

## What is copied from the reference

| Copied | How |
| --- | --- |
| Cut timing / rhythm | Frame-difference shot detection on the reference |
| Transitions | Dissolves (blend test), dips to black/white, flash frames → recreated with ffmpeg `xfade` |
| Sound | The reference's whole audio track (music, SFX, voice) is laid under the edit |
| Look | Brightness, contrast, saturation and colour balance matched per shot |
| Format | Resolution, aspect ratio, frame rate, intro/outro fades |

Not copied automatically: text/titles, stickers, overlays, speed ramps, zoom/shake effects and masks baked into the
reference — these can't be separated from its pixels. Footage is picked from each clip by detail, exposure and
motion similar to the reference shot; if fewer reference shots than clips exist, the longest shots are split so
every clip is used.

## Code

- `server.js` — HTTP API + static files, job runner, project storage (`app/data/<id>/project.json`)
- `lib/analyze.js` — reference shot/transition detection and clip scoring on 32×18 frames
- `lib/plan.js` — builds the edit plan (EDL) the editor edits
- `lib/render.js` — plan → one ffmpeg filter graph (`overlay` framing, `eq`/`colorchannelmixer` grade, `xfade`/`concat`, audio mix)
- `public/` — the web app (vanilla JS)
- `test/make-samples.sh` — synthetic reference + clips with known cuts for testing
