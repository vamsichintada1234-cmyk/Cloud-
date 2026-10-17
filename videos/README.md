# HyperFrames videos

Every video is its own HyperFrames project in `videos/<name>/`, created with:

```bash
scripts/new-video.sh <name>                         # 1920x1080
scripts/new-video.sh <name> --resolution portrait   # 1080x1920 (also: square, landscape-4k, portrait-4k)
```

Then ask Claude: *"Using /hyperframes, make … from the files in videos/<name>"*.
The `/hyperframes` router picks the workflow (captions, talking-head recut, product promo,
explainer, music video, motion graphic, slideshow, or general edit/montage).

## Where to put your files

```
videos/<name>/
├── assets/                 ← anything that may appear or be heard in the video
│   ├── footage/            ← 1. SOURCE FOOTAGE (A-roll: talking head, interview, screen recording, gameplay, event)
│   ├── broll/              ← 3. B-ROLL clips (cutaways, product shots, stock)
│   ├── images/             ← 3. IMAGES & SCREENSHOTS (photos, UI screenshots, stills)
│   ├── music/              ← 4. music beds
│   ├── sfx/                ← 4. sound effects
│   ├── voice/              ← 4. voiceover / narration recordings
│   └── brand/              ← 4. logos (SVG/PNG), brand fonts, colour palette
├── reference/              ← 2. REFERENCE VIDEOS + style frames, scripts, brand guides, notes
│                              (studied for style/pacing only; never placed in the edit)
├── index.html              ← the composition (written by Claude)
└── renders/                ← finished MP4s
```

`videos/_shared/brand/` and `videos/_shared/music/` are copied into every new project, so put a
reusable brand kit there once.

**Formats:** MP4 (H.264), MOV or WebM for video; MP3/WAV/M4A for audio; PNG/JPG/WebP/SVG for images.
Other formats (MKV, AVI, MTS) work but get converted first.

## Getting files into a cloud session

Video and audio files are git-ignored (too large for a normal repo), so they do not persist
between cloud sessions. For each session either attach them in the chat, provide a direct
download link, or commit them with Git LFS.

## Commands (run inside `videos/<name>/`)

| Command | Purpose |
| --- | --- |
| `npx hyperframes check` | lint + runtime + layout + contrast gate |
| `npx hyperframes preview --background` | Studio preview server |
| `npx hyperframes render --quality draft --output renders/draft.mp4` | quick render |
| `npx hyperframes render --quality delivery --output renders/final.mp4` | final render |
| `npx hyperframes transcribe assets/footage/<clip>.mp4` | word-level transcript |

## Updating HyperFrames

The CLI version is pinned in `videos/.hyperframes-version` and the skills are vendored in
`.claude/skills` (`skills-lock.json`). Auto-updates are off (`HYPERFRAMES_SKIP_SKILLS=1` in
`.claude/settings.json`) so every session uses the same snapshot. To upgrade deliberately:

```bash
npx -y skills add https://github.com/heygen-com/hyperframes --agent claude-code --copy --full-depth --yes \
  $(for s in $(npx -y hyperframes@latest skills check --json | jq -r '.skills[] | select(.status != "removed") | .name'); do echo --skill "$s"; done)
echo "<new version>" > videos/.hyperframes-version
HYPERFRAMES_SKIP_SKILLS= npx hyperframes@latest skills check
```
