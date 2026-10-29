# Jarvis for iPad

A J.A.R.V.I.S.-style voice assistant that runs in Safari on iPad and installs to the Home Screen. Claude is the brain.

- Talk to it with the mic button (Safari speech recognition), or type / use keyboard dictation.
- Replies are spoken aloud with an iPad system voice (pick a British one such as Daniel in Settings).
- Conversation mode keeps listening after each reply.
- Speaks Telugu by default (తెలుగు). Settings has Telugu, Tenglish (Telugu in English letters) and English. It understands all three whichever you pick. To hear Telugu out loud, install a Telugu voice in iPad Settings, Accessibility, Spoken Content, Voices.
- Things it can do for you:
  - Time and date, countdown timers, and reminders at a clock time ("remind me at 7 pm to call mom"). They chime and speak when due, while Jarvis is open.
  - A to-do list you manage by voice: add, tick off, delete.
  - Memory of things you tell it, stored only on the iPad.
  - Web search for news, weather, scores and facts (Home Screen version with an API key).
  - One-tap buttons for websites, YouTube, Apple Maps directions, calls, texts, email and FaceTime.
  - Running your Siri Shortcuts by name, which covers anything else iPadOS can do: alarms, music, smart home, settings, sending messages.

Websites can't open apps or tap things on their own, so actions show as a button you tap once.

## Run it on your iPad

The app is static files: `index.html`, `manifest.webmanifest`, `sw.js` and `icons/`. Any HTTPS host works.

1. Host this folder over HTTPS (for example GitHub Pages on this repo, pointing at `/jarvis`).
2. Open the URL in Safari on the iPad, tap Share, then **Add to Home Screen**.
3. Open Jarvis from the Home Screen, tap the gear, and paste an Anthropic API key (from console.anthropic.com). The key is stored in the iPad's local storage and sent only to `api.anthropic.com`.
4. Allow microphone access the first time you tap the mic.

When the page is opened inside Claude as a published artifact, it uses your Claude account instead and needs no key.

## Notes

- Uses the Messages API directly from the browser (`claude-opus-5-5`, low effort for snappy spoken replies; "Smarter, slower" in Settings raises it to medium).
- Anyone with access to the iPad can read the stored key. Use a key with a spending limit.
