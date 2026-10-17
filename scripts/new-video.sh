#!/usr/bin/env bash
# Scaffold a HyperFrames video project in videos/<name> with the standard input folders.
#
#   scripts/new-video.sh <name> [hyperframes init flags]
#   scripts/new-video.sh launch-teaser --resolution portrait
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HF_VERSION="$(tr -d '[:space:]' < "$ROOT/videos/.hyperframes-version")"

if [ $# -lt 1 ]; then
  echo "usage: scripts/new-video.sh <name> [hyperframes init flags]" >&2
  exit 1
fi
NAME="$1"; shift
if [[ ! "$NAME" =~ ^[a-z0-9][a-z0-9._-]*$ ]]; then
  echo "name must be lowercase letters, digits, '.', '_' or '-'" >&2
  exit 1
fi
DEST="$ROOT/videos/$NAME"
if [ -e "$DEST" ]; then
  echo "videos/$NAME already exists" >&2
  exit 1
fi

cd "$ROOT/videos"
HYPERFRAMES_SKIP_SKILLS=1 npx -y "hyperframes@$HF_VERSION" init "$NAME" --non-interactive "$@"

# assets/ is what the composition may place (media-use adopts it by subfolder);
# reference/ is study material only, kept outside assets/ so it is never placed.
for dir in footage broll images music sfx voice brand; do
  mkdir -p "$DEST/assets/$dir"
  touch "$DEST/assets/$dir/.gitkeep"
done
mkdir -p "$DEST/reference" "$DEST/renders"
touch "$DEST/reference/.gitkeep"

# Reusable brand kit and music shared across every video.
cp -R "$ROOT/videos/_shared/brand/." "$DEST/assets/brand/"
cp -R "$ROOT/videos/_shared/music/." "$DEST/assets/music/"

echo
echo "Created videos/$NAME"
echo "  footage     -> videos/$NAME/assets/footage/"
echo "  reference   -> videos/$NAME/reference/"
echo "  images/b-roll -> videos/$NAME/assets/images/, videos/$NAME/assets/broll/"
echo "  music/sfx/voice/brand -> videos/$NAME/assets/{music,sfx,voice,brand}/"
