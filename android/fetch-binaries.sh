#!/usr/bin/env bash
# Downloads nodejs-mobile (Node.js as an Android library, runs app/server.js on the phone) into
# third_party/ (not kept in git). ffmpeg comes from Maven (FFmpegKit) via Gradle.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p third_party && cd third_party
NODE_VER=18.20.4
if [ ! -f nodejs-mobile/bin/arm64-v8a/libnode.so ]; then
  curl -fSL -o nodejs-mobile.zip "https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v${NODE_VER}/nodejs-mobile-v${NODE_VER}-android.zip"
  rm -rf nodejs-mobile && unzip -q nodejs-mobile.zip -d nodejs-mobile && rm nodejs-mobile.zip
fi
echo "third_party ready"
