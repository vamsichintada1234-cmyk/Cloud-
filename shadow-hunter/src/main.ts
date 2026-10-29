import { Sound } from "./audio";
import { Game } from "./game";
import { DEFAULT_HERO, HEROES, Hero, heroBars, heroById } from "./heroes";
import { Renderer3D, renderHeroPortraits } from "./render3d";

/**
 * URL options:
 *   ?level=N   level the Start button opens (default 1)
 *   ?crowd=N   number of guards, overriding the level's default (1-2000)
 *   ?bench=S   benchmark mode: skips the menu, autopilot, invulnerable player, FPS overlay, runs for S seconds
 *              (any truthy value means 15 s; empty, 0, false or off disables it)
 */
interface Params {
  level: number | null;
  crowd: number | null;
  bench: number;
}

function parseParams(): Params {
  const q = new URLSearchParams(location.search);
  const int = (v: string | null, min: number, max: number): number | null => {
    if (v === null || v.trim() === "") return null;
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
  };
  const benchRaw = q.get("bench");
  let bench = 0;
  if (benchRaw !== null && !["", "0", "false", "off", "no"].includes(benchRaw.trim().toLowerCase())) {
    const n = Number(benchRaw);
    bench = Number.isFinite(n) && n > 1 ? Math.min(n, 600) : 15;
  }
  return { level: int(q.get("level"), 1, 999), crowd: int(q.get("crowd"), 1, 2000), bench };
}

function guardsForLevel(level: number): number {
  return Math.min(3 + Math.floor(level * 1.2), 24);
}

function loadNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}
function saveNumber(key: string, n: number): void {
  try {
    localStorage.setItem(key, String(n));
  } catch {
    /* storage unavailable: progress just won't persist */
  }
}

const params = parseParams();
const $ = (id: string) => document.getElementById(id)!;
const app = $("app");
const renderer = new Renderer3D(app);
const sound = new Sound();

type Mode = "menu" | "playing" | "ended";
let mode: Mode = "menu";
let game!: Game;
let level = params.level ?? 1;
let bankedGems = loadNumber("shadowHunter.gems");

// ---- Characters bought in the shop ----
function loadOwned(): Set<string> {
  try {
    const list = JSON.parse(localStorage.getItem("shadowHunter.owned") ?? "[]");
    return new Set<string>(Array.isArray(list) ? list.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
const owned = loadOwned();
owned.add(DEFAULT_HERO.id);
function loadSelected(): Hero {
  try {
    const h = heroById(localStorage.getItem("shadowHunter.hero"));
    return owned.has(h.id) ? h : DEFAULT_HERO;
  } catch {
    return DEFAULT_HERO;
  }
}
let hero = loadSelected();
function saveShop(): void {
  try {
    localStorage.setItem("shadowHunter.owned", JSON.stringify([...owned]));
    localStorage.setItem("shadowHunter.hero", hero.id);
    localStorage.setItem("shadowHunter.gems", String(bankedGems));
  } catch {
    /* storage unavailable: purchases last until the app closes */
  }
}
let shownAlive = -1;

function makeGame(lv: number): Game {
  return new Game({
    level: lv,
    guards: params.crowd ?? guardsForLevel(lv),
    autopilot: params.bench > 0,
    invulnerable: params.bench > 0,
    hero: params.bench > 0 ? DEFAULT_HERO : hero,
  });
}

function startLevel(lv: number): void {
  level = lv;
  game = makeGame(lv);
  // Handy for poking at the game from devtools during development.
  if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
  mode = "playing";
  app.classList.remove("in-menu");
  $("menu").classList.remove("show");
  $("end").classList.remove("show");
  $("level").textContent = `LEVEL ${lv}`;
  shownAlive = -1;
}

/** Main menu, with the first level drawn (frozen) behind it. */
function showMenu(): void {
  mode = "menu";
  game = makeGame(params.level ?? 1);
  $("level").textContent = `LEVEL ${game.opts.level}`;
  shownAlive = -1;
  const saved = loadNumber("shadowHunter.level");
  const cont = $("continueBtn") as HTMLButtonElement;
  cont.hidden = saved <= 1 || params.level !== null;
  cont.textContent = `Continue · Level ${saved}`;
  $("end").classList.remove("show");
  $("menu").classList.add("show");
  app.classList.add("in-menu");
}

function showEnd(title: string, text: string, btn: string, action: () => void): void {
  mode = "ended";
  $("endTitle").textContent = title;
  $("endText").textContent = text;
  const b = $("endBtn") as HTMLButtonElement;
  b.textContent = btn;
  b.onclick = () => {
    sound.play("click");
    action();
  };
  $("end").classList.add("show");
}

// ---- Buttons ----
$("startBtn").addEventListener("click", () => {
  sound.unlock();
  sound.play("click");
  startLevel(params.level ?? 1);
});
$("continueBtn").addEventListener("click", () => {
  sound.unlock();
  sound.play("click");
  startLevel(Math.max(1, loadNumber("shadowHunter.level")));
});
// ---- Shop ----
let portraits: string[] | null = null;

function renderShop(): void {
  $("shopGems").textContent = `◆ ${bankedGems}`;
  // Portraits need WebGL, so render them the first time the shop opens rather than at startup.
  portraits ??= renderHeroPortraits(HEROES);
  const list = $("shopList");
  list.textContent = "";
  HEROES.forEach((h, i) => {
    const card = document.createElement("div");
    card.className = "hero" + (h === hero ? " selected" : "");
    const img = document.createElement("img");
    img.className = "pic";
    img.alt = h.name;
    img.src = portraits![i];
    const info = document.createElement("div");
    const name = document.createElement("h3");
    name.textContent = h.name;
    const blurb = document.createElement("div");
    blurb.className = "blurb";
    blurb.textContent = h.blurb;
    const bars = document.createElement("div");
    bars.className = "bars";
    for (const b of heroBars(h)) {
      const label = document.createElement("span");
      label.textContent = b.label;
      const bar = document.createElement("div");
      bar.className = "bar";
      const fill = document.createElement("i");
      fill.style.width = `${Math.round(b.value * 100)}%`;
      bar.appendChild(fill);
      bars.append(label, bar);
    }
    const btn = document.createElement("button");
    if (h === hero) {
      btn.className = "using";
      btn.textContent = "IN USE ✓";
    } else if (owned.has(h.id)) {
      btn.className = "pick";
      btn.textContent = "SELECT";
      btn.onclick = () => {
        sound.play("click");
        selectHero(h);
      };
    } else {
      const short = h.price - bankedGems;
      btn.className = "buy" + (short > 0 ? " short" : "");
      btn.textContent = short > 0 ? `◆ ${h.price} · need ${short} more` : `BUY ◆ ${h.price}`;
      btn.onclick = () => {
        if (bankedGems < h.price) {
          sound.play("deny");
          btn.classList.remove("shake");
          void btn.offsetWidth;
          btn.classList.add("shake");
          return;
        }
        bankedGems -= h.price;
        owned.add(h.id);
        sound.play("buy");
        selectHero(h);
      };
    }
    info.append(name, blurb, bars, btn);
    card.append(img, info);
    list.appendChild(card);
  });
}

function selectHero(h: Hero): void {
  hero = h;
  saveShop();
  // Show the new character behind the menu straight away.
  if (mode === "menu") game = makeGame(game.opts.level);
  renderShop();
}

function openShop(): void {
  sound.unlock();
  sound.play("click");
  renderShop();
  $("shop").classList.add("show");
}
$("shopOpen").addEventListener("click", openShop);
$("endShopBtn").addEventListener("click", openShop);
$("shopBack").addEventListener("click", () => {
  sound.play("click");
  $("shop").classList.remove("show");
});

$("menuBtn").addEventListener("click", () => {
  sound.play("click");
  showMenu();
});

function syncToggles(): void {
  $("musicBtn").setAttribute("aria-pressed", String(sound.musicOn));
  $("sfxBtn").setAttribute("aria-pressed", String(sound.sfxOn));
}
$("musicBtn").addEventListener("click", () => {
  sound.unlock();
  sound.setMusic(!sound.musicOn);
  sound.play("click");
  syncToggles();
});
$("sfxBtn").addEventListener("click", () => {
  sound.unlock();
  sound.setSfx(!sound.sfxOn);
  sound.play("click");
  syncToggles();
});
syncToggles();

// ---- Input ----
const canvas = renderer.renderer.domElement;
let pointerDown = false;
let lastRetarget = 0;
function target(e: PointerEvent): void {
  if (params.bench || mode !== "playing") return;
  const w = renderer.toWorld(e.clientX, e.clientY);
  if (!w) return;
  game.setTarget(w);
  renderer.marker = { x: w.x, y: w.y, t: 0 };
  $("hint").style.opacity = "0";
}
canvas.addEventListener("pointerdown", (e) => {
  pointerDown = true;
  canvas.setPointerCapture(e.pointerId);
  target(e);
});
canvas.addEventListener("pointermove", (e) => {
  if (!pointerDown || performance.now() - lastRetarget < 90) return;
  lastRetarget = performance.now();
  target(e);
});
canvas.addEventListener("pointerup", () => (pointerDown = false));
canvas.addEventListener("pointercancel", () => (pointerDown = false));

const keys = new Set<string>();
const keyMap: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
window.addEventListener("keydown", (e) => {
  if (e.code in keyMap) {
    keys.add(e.code);
    e.preventDefault();
    $("hint").style.opacity = "0";
  } else if (e.code === "Enter") {
    if (mode === "menu") ($("startBtn") as HTMLButtonElement).click();
    else if (mode === "ended") ($("endBtn") as HTMLButtonElement).click();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

new ResizeObserver(() => renderer.resize()).observe(app);
renderer.resize();

/** Enemy tracker: one head per guard (crossed out when down), or a count for big crowds. */
function renderTargets(): void {
  const alive = game.aliveGuards;
  if (alive === shownAlive) return;
  shownAlive = alive;
  const el = $("targets");
  const total = game.guards.length;
  if (total > 16) {
    el.textContent = `${alive} / ${total} left`;
    return;
  }
  el.textContent = "";
  for (let i = 0; i < total; i++) {
    const d = document.createElement("span");
    d.className = i < total - alive ? "foe down" : "foe";
    el.appendChild(d);
  }
}

// ---- Bench stats ----
interface BenchResult {
  seconds: number;
  frames: number;
  avgFps: number;
  avgFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  avgUpdateMs: number;
  avgDrawMs: number;
  guards: number;
  kills: number;
  map: string;
}
const frameTimes: number[] = [];
let benchStart = 0;
let benchDone = false;
let updateMsSum = 0;
let drawMsSum = 0;
const fpsWindow: number[] = [];

function benchResult(): BenchResult {
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const total = frameTimes.reduce((s, v) => s + v, 0);
  const n = Math.max(1, frameTimes.length);
  return {
    seconds: +(total / 1000).toFixed(2),
    frames: frameTimes.length,
    avgFps: +((1000 * n) / Math.max(1, total)).toFixed(1),
    avgFrameMs: +(total / n).toFixed(2),
    p95FrameMs: +(sorted[Math.floor(n * 0.95)] ?? 0).toFixed(2),
    maxFrameMs: +(sorted[sorted.length - 1] ?? 0).toFixed(2),
    avgUpdateMs: +(updateMsSum / n).toFixed(3),
    avgDrawMs: +(drawMsSum / n).toFixed(3),
    guards: game.opts.guards,
    kills: game.kills,
    map: `${game.grid.w}x${game.grid.h}`,
  };
}

function benchFrame(now: number, rawDt: number, updateMs: number, drawMs: number): void {
  if (benchDone) return;
  if (!benchStart) benchStart = now;
  else {
    frameTimes.push(rawDt);
    updateMsSum += updateMs;
    drawMsSum += drawMs;
  }
  fpsWindow.push(now);
  while (fpsWindow.length && fpsWindow[0] < now - 1000) fpsWindow.shift();
  const elapsed = (now - benchStart) / 1000;
  const r = benchResult();
  $("bench").textContent =
    `BENCH  ${elapsed.toFixed(1)} / ${params.bench}s\n` +
    `fps      ${fpsWindow.length}\n` +
    `avg fps  ${r.avgFps}\n` +
    `frame    ${r.avgFrameMs} ms (p95 ${r.p95FrameMs})\n` +
    `update   ${r.avgUpdateMs} ms\n` +
    `draw     ${r.avgDrawMs} ms\n` +
    `guards   ${r.guards}   kills ${r.kills}\n` +
    `map      ${r.map}`;
  if (elapsed >= params.bench) {
    benchDone = true;
    (window as unknown as { __benchResult: BenchResult }).__benchResult = r;
    console.log("BENCH " + JSON.stringify(r));
    showEnd("Benchmark done", `${r.avgFps} fps avg · ${r.avgFrameMs} ms/frame · p95 ${r.p95FrameMs} ms · ${r.guards} guards`, "RUN AGAIN", () =>
      location.reload(),
    );
  }
}

// ---- Main loop ----
let last = performance.now();

function frame(now: number): void {
  const rawDt = now - last;
  last = now;
  const dt = Math.min(rawDt / 1000, 0.05);

  let mx = 0;
  let my = 0;
  for (const k of keys) {
    mx += keyMap[k][0];
    my += keyMap[k][1];
  }
  game.moveInput = { x: mx, y: my };

  const t0 = performance.now();
  // The menu shows the level frozen; play and end screens keep the world moving.
  if (mode !== "menu") game.update(dt);
  for (const e of game.events) sound.play(e);
  game.events.length = 0;
  const t1 = performance.now();
  renderer.setHero(game.opts.hero);
  const rays = game.guards.length > 200 ? 8 : game.guards.length > 60 ? 14 : 24;
  renderer.render(game, rays, mode === "menu" ? 0 : dt);
  const t2 = performance.now();
  if (renderer.marker) {
    renderer.marker.t += dt;
    if (renderer.marker.t > 0.45) renderer.marker = null;
  }

  renderTargets();
  // Once a level ends its gems are either banked (won) or forfeited (lost), so stop adding them.
  $("gems").textContent = `◆ ${bankedGems + (mode === "playing" ? game.gemsCollected : 0)}`;

  if (params.bench) benchFrame(now, rawDt, t1 - t0, t2 - t1);

  if (!params.bench && mode === "playing" && game.outcome !== "playing") {
    if (game.outcome === "won") {
      bankedGems += game.gemsCollected;
      saveNumber("shadowHunter.gems", bankedGems);
      saveNumber("shadowHunter.level", Math.max(level + 1, loadNumber("shadowHunter.level")));
      showEnd("Level complete", `${game.kills} targets eliminated · +${game.gemsCollected} gems`, "NEXT LEVEL", () => startLevel(level + 1));
    } else {
      showEnd("You were spotted", `Level ${level} · ${game.kills}/${game.guards.length} targets down`, "RETRY", () => startLevel(level));
    }
  }

  requestAnimationFrame(frame);
}

if (params.bench) {
  renderer.fitWholeMap = true;
  $("bench").style.display = "block";
  $("hint").style.display = "none";
  startLevel(params.level ?? 1);
} else {
  showMenu();
}
requestAnimationFrame(frame);
