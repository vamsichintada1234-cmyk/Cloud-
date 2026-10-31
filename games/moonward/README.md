# Moonward

A 3D space game in a single HTML file (three.js). Fly an astronaut from Earth to the Moon.

**Play:** open `index.html` in a browser (needs internet to load three.js from the CDN).

## The journey
1. **Launch.** A rocket lifts off from Earth with a countdown. Once it leaves the atmosphere the booster separates and falls back to Earth.
2. **Fly.** The astronaut fires up the jetpack and flies the remaining 384,400 km through five stages:
   Low Earth Orbit → Space Junk Belt → Asteroid Field → Solar Storm → Lunar Approach.
   Satellites, station arms, asteroids, junk and solar flare walls all spin and rotate.
3. **Crash.** Touching any obstacle breaches the suit and the astronaut breaks apart. A shield power-up saves you once.
   Each stage is a checkpoint, so you can retry from the last stage reached or restart from Earth.
4. **Win.** Reach the Moon, land, and plant the flag.

## Features
- Combo, near-miss bonuses and Fever mode (40 combo: invincible, double score)
- Power-ups: shield, magnet, slow-mo, double score
- Random space events: Stardust Rush, Stardust Storm, Gravity Flip, Solar Wind
- Blaster and boost
- Missions, pilot levels, coins and suit colors (saved in the browser)
- Procedural music that changes per stage and builds with your combo, plus synthesized sound effects (Web Audio, with reverb and delay)

## Controls
| Key | Action |
|---|---|
| W A S D / arrow keys | Fly |
| Space | Blaster |
| Shift | Boost (passes through anything) |
| P / Esc | Pause |
| M | Sound on/off |
| Enter | Launch / skip intro / retry |

On a phone: drag anywhere to fly; FIRE and BOOST buttons on screen.
