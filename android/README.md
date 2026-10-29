# RefCut Android app

The APK runs the whole RefCut app on the phone, offline: the web UI in a WebView, `app/server.js` on
[nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile) (Node 18 as a library), and ffmpeg 7.1 from
[FFmpegKit](https://github.com/ffmpegkit-maintained/ffmpeg) (`dev.ffmpegkit-maintained:ffmpeg-kit-full-gpl`, GPL-3.0).
Android can't run a plain Linux ffmpeg program, so `FfmpegBridge.java` runs ffmpeg commands through FFmpegKit and
serves them to Node on a token-protected 127.0.0.1 port (`runBridge` in `app/lib/ff.js`). Rendered videos are saved to
the gallery under `Movies/RefCut`.

## Build

Needs JDK 17+, the Android SDK (platform 35, build-tools 35, NDK 27.2.12479018, CMake 3.22.1).

```bash
cd android
./fetch-binaries.sh                       # downloads libnode.so into third_party/ (not in git)
echo "sdk.dir=$ANDROID_HOME" > local.properties
gradle assembleRelease                    # → app/build/outputs/apk/release/app-release.apk
```

The release APK is signed with the debug key so it can be sideloaded; sign with your own keystore for the Play Store.
Builds arm64-v8a by default (FFmpegKit has no 32-bit ARM build). Needs Android 7.0+.
