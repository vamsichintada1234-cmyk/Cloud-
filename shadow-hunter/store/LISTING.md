# Google Play store listing — Shadow Hunter

Everything below is ready to paste into Play Console. Character limits are Google's; counts were checked when written.

## Graphics (in this folder)

| Play Console field | File | Size / format |
|---|---|---|
| App icon | `icon-512.png` | 512 × 512, 32-bit PNG |
| Feature graphic | `feature-1024x500.png` | 1024 × 500, 24-bit PNG (no alpha) |
| Phone screenshots | `screenshot-1.png` … `screenshot-5.png` | 1080 × 1920, 24-bit PNG |

Screenshot order: 1 title screen · 2 sneaking past guards · 3 a takedown with gems · 4 a boss fight · 5 the character shop.
Regenerate them with `node scripts/store-assets.cjs` while `npm run dev` is running.

---

## English (en-US), default language

**App name** (30 max)

```
Shadow Hunter: Stealth Ninja
```

**Short description** (80 max)

```
Sneak through the dark, strike from behind and take down every guard.
```

**Full description** (4000 max)

```
Move in silence. Strike from the shadows. Leave no guard standing.

Shadow Hunter is a 3D stealth action game. Guards patrol each level with flashlights. Step into the light and they open fire. Stay in the dark, slip in behind them and take them down with one strike.

HOW TO PLAY
• Tap where you want to go. Your ninja finds the way around the walls.
• Watch the flashlights. Yellow means patrolling, orange means searching, red means you've been spotted.
• Reach a guard to take them out, then collect the gems they drop.
• Clear every guard to finish the level.

BOSS LEVELS
Every fifth level, a boss waits at the far end of the map. It sees further, fires three-round bursts and survives several hits. Strike, fall back, hide and strike again.

CHARACTER SHOP
Spend your gems on new characters, each with their own abilities:
• Shadow: the balanced original
• Swift: faster on its feet
• Brute: much tougher, a little slower
• Ghost: guards spot you from shorter range
• Ronin: tough, with a longer reach

FEATURES
• Real-time 3D levels with lights, shadows and flashlight cones
• Levels get bigger and tougher as you go
• Original music and sound effects, each with its own on/off switch
• Plays fully offline
• No ads. No in-app purchases. No data collected.

How long can you stay in the shadows?
```

---

## Telugu (te-IN), optional translation

Add it in Play Console under **Main store listing → Manage translations → Telugu**.

**App name** (30 max)

```
Shadow Hunter: Stealth Ninja
```

**Short description** (80 max)

```
చీకట్లో దాక్కుని, వెనక నుంచి దాడి చేసి, ప్రతి గార్డ్‌ని పడగొట్టండి.
```

**Full description**

```
నిశ్శబ్దంగా కదలండి. నీడల్లోంచి దాడి చేయండి. ఒక్క గార్డ్‌ని కూడా వదలకండి.

Shadow Hunter ఒక 3D stealth action game. ప్రతి level లో guards flashlight లతో గస్తీ తిరుగుతుంటారు. వెలుగులోకి అడుగుపెడితే కాల్పులు మొదలుపెడతారు. చీకట్లోనే ఉంటూ, వాళ్ళ వెనక్కి చేరి, ఒక్క దెబ్బతో పడగొట్టండి.

ఎలా ఆడాలి
• ఎక్కడికి వెళ్ళాలో అక్కడ tap చేయండి. మీ ninja గోడల చుట్టూ దారి తనే వెతుక్కుంటుంది.
• Flashlight లను గమనించండి. పసుపు అంటే గస్తీ, నారింజ అంటే వెతుకుతున్నారు, ఎరుపు అంటే మిమ్మల్ని చూసేశారు.
• Guard దగ్గరికి చేరితే పడగొట్టేస్తారు. వాళ్ళు వదిలే gems ఏరుకోండి.
• Guards అందరినీ పడగొడితే level పూర్తవుతుంది.

BOSS LEVELS
ప్రతి 5వ level లో map చివర ఒక boss ఎదురుచూస్తుంటుంది. అది ఎక్కువ దూరం చూస్తుంది, ఒకేసారి 3 బుల్లెట్లు కాలుస్తుంది, చాలా దెబ్బలు తట్టుకుంటుంది. కొట్టండి, వెనక్కి తగ్గండి, దాక్కోండి, మళ్ళీ కొట్టండి.

CHARACTER SHOP
మీ gems తో కొత్త characters కొనుక్కోండి. ఒక్కోదానికి ఒక్కో ప్రత్యేకత:
• Shadow: అసలైన, సమతుల్యమైన ninja
• Swift: ఎక్కువ వేగం
• Brute: చాలా బలం, కొంచెం నెమ్మది
• Ghost: guards మిమ్మల్ని తక్కువ దూరం నుంచే గుర్తించగలరు
• Ronin: బలంగా, కత్తి దూరం ఎక్కువ

ప్రత్యేకతలు
• వెలుగు, నీడలు, flashlight కాంతితో 3D levels
• ముందుకు వెళ్ళే కొద్దీ levels పెద్దవిగా, కష్టంగా మారతాయి
• సొంత music, sound effects. రెండింటికీ వేర్వేరు on/off buttons
• Internet లేకుండానే పూర్తిగా ఆడొచ్చు
• Ads లేవు. In-app purchases లేవు. ఏ data సేకరించదు.

నీడల్లో ఎంతసేపు నిలవగలరు?
```

---

## Other Play Console answers

**App category:** Game → Action
**Tags:** Stealth, Action, Ninja, Offline, Single player
**Contains ads:** No
**In-app purchases:** No (gems are earned in the game only)

**Privacy policy URL:** host `PRIVACY.md` somewhere public and paste its link. The simplest way: once this branch is merged into `master`, the GitHub page for `shadow-hunter/store/PRIVACY.md` in this public repo works. Fill in the contact email first.

**Data safety form**
- Does your app collect or share any of the required user data types? **No**
- (Progress saved only on the device doesn't count as "collected", since it never leaves the device through the app.)

**Content rating questionnaire (IARC)**, answer honestly:
- Category: Game
- Violence: **Yes**. Players defeat human enemies with a sword, and enemies shoot guns.
- Blood: **Yes**, small blood splats on takedowns
- Sexual content, profanity, drugs, alcohol, gambling: **No**
- User-to-user interaction, sharing location, digital purchases: **No**
- Expect roughly a **Teen / PEGI 12** rating.

**Target audience and content:** choose **13 and over**. The game has weapons and blood, and picking ages under 13 would bring in Google's extra Families policy requirements.

**App access:** all functionality is available without login.
