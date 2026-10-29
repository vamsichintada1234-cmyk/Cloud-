#!/usr/bin/env bash
# Downloads the native pieces the APK bundles (not kept in git):
#  - nodejs-mobile (Node.js as an Android library) → runs app/server.js on the phone
#  - a static arm64 ffmpeg build → does the video work
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p third_party && cd third_party
NODE_VER=18.20.4
if [ ! -f nodejs-mobile/bin/arm64-v8a/libnode.so ]; then
  curl -fSL -o nodejs-mobile.zip "https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v${NODE_VER}/nodejs-mobile-v${NODE_VER}-android.zip"
  rm -rf nodejs-mobile && unzip -q nodejs-mobile.zip -d nodejs-mobile && rm nodejs-mobile.zip
fi
if [ ! -f ffmpeg/ffmpeg ]; then
  curl -fSL -o ffmpeg.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz
  curl -fSL -o ffmpeg.tar.xz.md5 https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz.md5
  [ "$(md5sum < ffmpeg.tar.xz | cut -d' ' -f1)" = "$(cut -d' ' -f1 ffmpeg.tar.xz.md5)" ] || { echo "ffmpeg checksum mismatch" >&2; exit 1; }
  mkdir -p ffmpeg && tar xf ffmpeg.tar.xz -C ffmpeg --strip-components=1 && rm ffmpeg.tar.xz ffmpeg.tar.xz.md5
fi
echo "third_party ready"
