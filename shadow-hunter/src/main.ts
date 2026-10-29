import { Game } from "./game";
import { Renderer } from "./render";

/**
 * URL options:
 *   ?level=N   level to start on (default 1)
 *   ?crowd=N   number of guards, overriding the level's default (1-2000)
 *   ?bench=S   benchmark mode: autopilot, invulnerable player, FPS overlay, runs for S seconds
 *              (any truthy value means 15 s; empty, 0, false or off disables it)
 */
interface Params {
  level: number;
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
  return { level: int(q.get("level"), 1, 999) ?? 1, crowd: int(q.get("crowd"), 1, 2000), bench };
}

function guardsForLevel(level: number): number {
  return Math.min(3 + Math.floor(level * 1.2), 24);
}

const params = parseParams();
const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const $ = (id: string) => document.getElementById(id)!;

let game!: Game;
let level = params.level;

function loadGems(): number {
  try {
    return Number(localStorage.getItem("shadowHunter.gems")) || 0;
  } catch {
    return 0;
  }
}
function saveGems(n: number): void {
  try {
    localStorage.setItem("shadowHunter.gems", String(n));
  } catch {
    /* storage unavailable: gems just won't persist */
  }
}
let bankedGems = loadGems();
let shownAlive = -1;

/** Enemy tracker: one head per guard (crossed out when down), or a count for big crowds. */
function renderTargets(): void {
  const alive = game.aliveGuards;
  if (alive === shownAlive) return;
  shownAlive = alive;
  const el = $("targets");
  const total = game.guards.length;
  if (total > 24) {
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

function startLevel(lv: number): void {
  level = lv;
  game = new Game({
    level: lv,
    guards: params.crowd ?? guardsForLevel(lv),
    autopilot: params.bench > 0,
    invulnerable: params.bench > 0,
  });
  // Handy for poking at the game from devtools during development.
  if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
  $("overlay").classList.remove("show");
  $("level").textContent = `LEVEL ${lv}`;
  shownAlive = -1;
  const q = new URLSearchParams(location.search);
  q.set("level", String(lv));
  history.replaceState(null, "", `${location.pathname}?${q.toString()}`);
}

function showOverlay(title: string, text: string, btn: string, action: () => void): void {
  $("ovTitle").textContent = title;
  $("ovText").textContent = text;
  const b = $("ovBtn") as HTMLButtonElement;
  b.textContent = btn;
  b.onclick = action;
  $("overlay").classList.add("show");
}

// ---- Input ----
let pointerDown = false;
let lastRetarget = 0;
function target(e: PointerEvent): void {
  if (params.bench) return;
  const w = renderer.toWorld(e.clientX, e.clientY);
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
  } else if (e.code === "Enter" && $("overlay").classList.contains("show")) {
    ($("ovBtn") as HTMLButtonElement).click();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

window.addEventListener("resize", () => renderer.resize());
renderer.resize();

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
let fpsWindow: number[] = [];

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

if (params.bench) {
  renderer.fitWholeMap = true;
  $("bench").style.display = "block";
  $("hint").style.display = "none";
}

// ---- Main loop ----
let last = performance.now();
let ended = false;

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
  game.update(dt);
  const t1 = performance.now();
  const rays = game.guards.length > 200 ? 8 : game.guards.length > 60 ? 14 : 24;
  renderer.draw(game, rays, dt);
  const t2 = performance.now();
  if (renderer.marker) {
    renderer.marker.t += dt;
    if (renderer.marker.t > 0.4) renderer.marker = null;
  }

  renderTargets();
  $("gems").textContent = `◆ ${bankedGems + game.gemsCollected}`;

  if (params.bench && !benchDone) {
    if (!benchStart) benchStart = now;
    else {
      frameTimes.push(rawDt);
      updateMsSum += t1 - t0;
      drawMsSum += t2 - t1;
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
      showOverlay(
        "Benchmark done",
        `${r.avgFps} fps avg · ${r.avgFrameMs} ms/frame · p95 ${r.p95FrameMs} ms · ${r.guards} guards`,
        "Run again",
        () => location.reload(),
      );
    }
  }

  if (!params.bench && !ended && game.outcome !== "playing") {
    ended = true;
    if (game.outcome === "won") {
      bankedGems += game.gemsCollected;
      saveGems(bankedGems);
      showOverlay("Level complete", `${game.kills} targets eliminated · +${game.gemsCollected} gems`, "Next level", () => {
        ended = false;
        startLevel(level + 1);
      });
    } else {
      showOverlay("You were spotted", `Level ${level} · ${game.kills}/${game.guards.length} targets down`, "Retry", () => {
        ended = false;
        startLevel(level);
      });
    }
  }

  requestAnimationFrame(frame);
}

startLevel(level);
requestAnimationFrame(frame);
