# My Phone — "Hello my phone" voice assistant for Android

మీ వాయిస్‌తో ఫోన్ మొత్తం కంట్రోల్ చేసే Android యాప్ — Google Assistant లాగా.
"**Hello my phone, open YouTube**" అంటే YouTube ఓపెన్ అవుతుంది, "**Call Amma**" అంటే అమ్మకి కాల్ వెళ్తుంది.

## What it can do

| Say | What happens |
|---|---|
| Hello my phone, open YouTube · *youtube open cheyi* · *యూట్యూబ్ ఓపెన్ చేయి* | Opens any installed app (fuzzy match: "insta", "whats app", "gpay") |
| Search Telugu songs on YouTube · *youtube lo songs search cheyi* · Play Pushpa songs | Searches inside YouTube |
| Search weather in Hyderabad · Who is … ? | Google search |
| Call Amma · *Amma ki call cheyi* · Dial 98765 43210 | Finds the contact and calls |
| Send WhatsApp to Ravi saying I am coming · Text Ravi saying hello | Opens the chat with the message typed; say "click send" |
| Navigate to Charminar · Where is … | Google Maps |
| Set alarm for 6:30 am · Set timer for 5 minutes | Clock app |
| Turn on flashlight · Torch off · Volume up / down / mute | Device controls |
| Take a photo · Open WiFi / Bluetooth settings | Camera, settings panels |
| Go back · Go home · Recent apps · Notifications · Take a screenshot · Lock the phone | Needs *full phone control* |
| Scroll down · Click Subscribe · Type hello how are you | Controls whatever app is on screen |
| What time is it · Today's date · Battery | Spoken answer |
| Stop | Stops listening |

Anything it does not understand is tried as an app name, then searched on Google.
With **Claude AI** turned on, those requests go to Claude instead (see below).

## Claude AI (optional)

Paste a Claude API key (from https://console.anthropic.com) into the app and press **Save**.

- Known commands ("open YouTube", "call Amma") still run instantly and offline. Claude is only used for questions and for requests the built-in rules don't recognise.
- Claude can **answer questions** in English or Telugu ("ఈరోజు హైదరాబాద్ వాతావరణం ఎలా ఉంది?") and uses **web search** for current information such as news, weather and cricket scores.
- Claude can **control the phone** from free-form speech: "naaku konchem music vinalani undi" leads to a `play … ` command, which the normal command engine runs.
- Answers are spoken aloud. Telugu answers use a Telugu voice if one is installed (Settings → Text-to-speech).
- Model: `claude-opus-5-5`, low effort for fast voice replies (`ai/ClaudeAssistant.kt`). Refusals fall back to another model on the server.
- The key is stored only on the phone (app-private storage, excluded from backups). Each request is billed to your Anthropic account. Save an empty key to turn Claude off.

## Build & install

Requirements: Android Studio (or JDK 17+ and the Android SDK), a phone with Android 8.0+.

```bash
cd android-phone-assistant
./gradlew assembleDebug          # APK: app/build/outputs/apk/debug/app-debug.apk
./gradlew installDebug           # installs on a USB-connected phone
./gradlew testDebugUnitTest      # command-parser tests
```

Or open the `android-phone-assistant` folder in Android Studio and press ▶ Run.

## First-time setup on the phone

1. Open **My Phone** → allow Microphone, Contacts, Phone and Notifications.
2. Tap **Turn on full phone control** → Accessibility → *My Phone* → On.
   This is what lets it press back/home, tap buttons, type, scroll, take screenshots and lock the screen.
3. Turn on **Always listen for "Hello my phone"** to use it hands-free.
4. Pick **English / Tenglish** (best for mixed speech like "amma ki call cheyi") or **తెలుగు**.
5. Speech recognition uses the Google app — keep it installed and updated.

## How it works

```
Mic ─► SpeechRecognizer ─► TeluguNormalizer ─► CommandParser ─► CommandExecutor ─► TTS reply
                                                      │ unknown / question      ▲
                                                      └──► Claude ──(command)───┘ or spoken answer
        (voice/)              (Telugu/Tenglish       (text → Command)   (Intents, contacts,
                               → English, SOV order)                   PhoneAccessibilityService)
```

- `command/` — pure Kotlin, no Android: normalizer, parser, fuzzy matcher. Fully unit tested.
- `system/CommandExecutor.kt` — turns a command into Android intents (call, YouTube search, maps, alarm…).
- `system/PhoneAccessibilityService.kt` — global actions, tap-by-text, typing and swipe gestures.
- `voice/WakeWordService.kt` — foreground service that listens for "Hello my phone".
- `ai/ClaudeAssistant.kt` — Claude API call (Anthropic Java SDK): a `run_phone_command` tool plus web search.
- Add a new command: add a case to `Command`, a rule in `CommandParser`, the action in `CommandExecutor`, and a test.

## Known limits

- Android doesn't let normal apps switch Wi-Fi/Bluetooth/mobile data on or off, so those commands open the right settings panel and you tap the toggle.
- The always-listening mode restarts Android's speech recognizer in a loop. Some phones play a short beep each time and it uses more battery. A real offline wake-word engine (e.g. Porcupine or Vosk) would fix both and is a good next step.
- With "always listen" on, Android only lets the app open other apps from the background when full phone control (accessibility) is on.
- WhatsApp numbers saved without a country code get +91 (`PhoneNumbers.DEFAULT_COUNTRY_CODE`).
- For Play Store release, Google reviews apps that use the Accessibility API, so the store listing has to explain why it's needed.
