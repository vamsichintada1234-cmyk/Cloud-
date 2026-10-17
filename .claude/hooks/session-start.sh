#!/bin/bash
# Prepare the machine-level HyperFrames runtime in Claude Code cloud sessions.
# Skills are vendored in .claude/skills; this only restores what lives outside the
# repo: the pinned Chrome headless shell (rendering) and whisper.cpp (transcription).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
HF_VERSION="$(tr -d '[:space:]' < "$ROOT/videos/.hyperframes-version")"
export HYPERFRAMES_SKIP_SKILLS=1

# Rendering: download (or reuse) the Chrome build HyperFrames pins for reproducible frames.
npx -y "hyperframes@$HF_VERSION" browser ensure > /dev/null

# Transcription: the first transcribe builds whisper.cpp and fetches the default model.
# Warm both with one second of silence so captions/footage workflows start immediately.
WARM_DIR="$(mktemp -d)"
trap 'rm -rf "$WARM_DIR"' EXIT
ffmpeg -v error -f lavfi -i anullsrc=r=16000:cl=mono -t 1 "$WARM_DIR/silence.wav"
npx -y "hyperframes@$HF_VERSION" transcribe "$WARM_DIR/silence.wav" --dir "$WARM_DIR" --optional --json > /dev/null 2>&1 \
  || echo "HyperFrames: whisper.cpp warm-up failed; transcription will retry on first use." >&2

echo "HyperFrames $HF_VERSION ready (skills in .claude/skills, projects in videos/)."
