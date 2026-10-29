# Jarvis for iPad

A J.A.R.V.I.S.-style voice assistant that runs in Safari on iPad and installs to the Home Screen. Claude is the brain.

- Talk to it with the mic button (Safari speech recognition), or type / use keyboard dictation.
- Replies are spoken aloud with an iPad system voice (pick a British one such as Daniel in Settings).
- Conversation mode keeps listening after each reply.
- Built-in abilities: current time and date, countdown timers that chime and announce themselves, and a memory of things you ask it to remember (stored only on the iPad).

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
