# RefCut Android app

The APK runs the whole RefCut app on the phone, offline: the web UI in a WebView, `app/server.js` on
[nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile) (Node 18 as a library), and a static arm64
[ffmpeg 7](https://johnvansickle.com/ffmpeg/) build (GPLv3) for the video work. Rendered videos are saved to the
gallery under `Movies/RefCut`.

## Build

Needs JDK 17+, the Android SDK (platform 35, build-tools 35, NDK 27.2.12479018, CMake 3.22.1).

```bash
cd android
./fetch-binaries.sh                       # downloads libnode.so + ffmpeg into third_party/ (not in git)
echo "sdk.dir=$ANDROID_HOME" > local.properties
gradle assembleRelease                    # → app/build/outputs/apk/release/app-release.apk
```

The release APK is signed with the debug key so it can be sideloaded; sign with your own keystore for the Play Store.
arm64-v8a only (practically every phone from the last several years). Needs Android 7.0+.
