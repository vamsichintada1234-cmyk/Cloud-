import { Grid, TILE, Vec, generateMap, mulberry32 } from "./map";

export const PLAYER_RADIUS = 10;
export const GUARD_RADIUS = 11;
const KILL_RANGE = TILE * 0.9;
const BULLET_SPEED = 560;
const BULLET_DAMAGE = 25;

export type GuardState = "patrol" | "alert" | "search" | "dead";

export interface Guard {
  id: number;
  x: number;
  y: number;
  angle: number;
  state: GuardState;
  path: Vec[];
  wait: number;
  fireCd: number;
  lastSeen: Vec | null;
  searchT: number;
  deadT: number;
  lookBase: number;
  lookT: number;
  stride: number;
}

export interface Player {
  x: number;
  y: number;
  angle: number;
  hp: number;
  path: Vec[];
  lungeT: number;
  hurtT: number;
  repathT: number;
  stride: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface Gem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
}

export interface Splat {
  x: number;
  y: number;
  r: number;
  seed: number;
}

export interface Effect {
  kind: "slash" | "text";
  x: number;
  y: number;
  angle: number;
  t: number;
  text?: string;
}

export type Outcome = "playing" | "won" | "lost";

export interface GameOptions {
  level: number;
  guards: number;
  autopilot: boolean;
  invulnerable: boolean;
}

export class Game {
  grid: Grid;
  player: Player;
  guards: Guard[] = [];
  bullets: Bullet[] = [];
  gems: Gem[] = [];
  splats: Splat[] = [];
  effects: Effect[] = [];
  /** Screen shake strength, decays every frame. */
  shake = 0;
  outcome: Outcome = "playing";
  gemsCollected = 0;
  kills = 0;
  time = 0;
  /** Bumped whenever the static wall layer must be redrawn. */
  mapVersion = 0;
  moveInput: Vec = { x: 0, y: 0 };

  readonly visionRange: number;
  readonly halfFov = 0.62;
  readonly patrolSpeed: number;
  readonly alertSpeed: number;
  readonly playerSpeed = 165;
  readonly fireInterval: number;
  private rng: () => number;

  constructor(readonly opts: GameOptions) {
    const lv = opts.level;
    this.visionRange = TILE * Math.min(4.5 + lv * 0.2, 7);
    this.patrolSpeed = Math.min(55 + lv * 3, 95);
    this.alertSpeed = Math.min(95 + lv * 3, 140);
    this.fireInterval = Math.max(0.65 - lv * 0.02, 0.35);
    this.rng = mulberry32(lv * 104729 + opts.guards);
    const { grid, spawn } = generateMap(lv, opts.guards);
    this.grid = grid;
    this.player = { x: spawn.x, y: spawn.y, angle: -Math.PI / 2, hp: 100, path: [], lungeT: 0, hurtT: 0, repathT: 0, stride: 0 };
    this.spawnGuards();
  }

  get aliveGuards(): number {
    let n = 0;
    for (const g of this.guards) if (g.state !== "dead") n++;
    return n;
  }

  /** Puts a fresh set of guards on the map (used at start and by bench mode to keep load constant). */
  spawnGuards(): void {
    const open = this.grid.openTiles();
    const p = this.player;
    const minDist = TILE * 7;
    const candidates = open.filter((i) => {
      const c = this.grid.center(i % this.grid.w, Math.floor(i / this.grid.w));
      return Math.hypot(c.x - p.x, c.y - p.y) > minDist;
    });
    const pool = candidates.length >= this.opts.guards ? candidates : open;
    this.guards = [];
    for (let k = 0; k < this.opts.guards; k++) {
      const idx = Math.floor(this.rng() * pool.length);
      const i = pool[idx];
      pool[idx] = pool[pool.length - 1];
      pool.pop();
      if (i === undefined) break;
      const c = this.grid.center(i % this.grid.w, Math.floor(i / this.grid.w));
      const a = this.rng() * Math.PI * 2;
      this.guards.push({
        id: k,
        x: c.x,
        y: c.y,
        angle: a,
        state: "patrol",
        path: [],
        wait: this.rng() * 2,
        fireCd: 0,
        lastSeen: null,
        searchT: 0,
        deadT: 0,
        lookBase: a,
        lookT: this.rng() * 10,
        stride: 0,
      });
    }
  }

  setTarget(target: Vec): void {
    if (this.outcome !== "playing") return;
    const path = this.grid.findPath(this.player, target, PLAYER_RADIUS);
    if (path) this.player.path = path;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.outcome === "playing") {
      this.updatePlayer(dt);
      for (const g of this.guards) this.updateGuard(g, dt);
      this.checkKills();
    } else {
      for (const g of this.guards) if (g.state === "dead") g.deadT += dt;
    }
    this.updateBullets(dt);
    this.updateGems(dt);
    this.shake = Math.max(0, this.shake - dt * 30);
    let w = 0;
    for (const e of this.effects) {
      e.t += dt;
      if (e.t < (e.kind === "slash" ? 0.25 : 0.9)) this.effects[w++] = e;
    }
    this.effects.length = w;

    if (this.outcome === "playing" && this.aliveGuards === 0) {
      if (this.opts.autopilot) {
        this.spawnGuards();
      } else if (this.gems.length === 0) {
        this.outcome = "won";
      }
    }
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    p.lungeT = Math.max(0, p.lungeT - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);

    if (this.opts.autopilot) this.autopilot(dt);

    let mx = this.moveInput.x;
    let my = this.moveInput.y;
    if (mx !== 0 || my !== 0) {
      p.path = [];
    } else if (p.path.length) {
      const wp = p.path[0];
      const dx = wp.x - p.x;
      const dy = wp.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 4) {
        p.path.shift();
      } else {
        mx = dx / d;
        my = dy / d;
      }
    }
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
      const speed = this.playerSpeed * (p.lungeT > 0 ? 1.6 : 1);
      p.stride += moveCircle(this.grid, p, mx * speed * dt, my * speed * dt, PLAYER_RADIUS);
      p.angle = turnToward(p.angle, Math.atan2(my, mx), 14 * dt);
    }
  }

  /** Bench mode: hunt the nearest living guard. */
  private autopilot(dt: number): void {
    const p = this.player;
    p.repathT -= dt;
    if (p.repathT > 0) return;
    p.repathT = 0.4;
    let best: Guard | null = null;
    let bestD = Infinity;
    for (const g of this.guards) {
      if (g.state === "dead") continue;
      const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    if (best) this.setTarget(best);
  }

  private canSee(g: Guard, target: Vec): boolean {
    const dx = target.x - g.x;
    const dy = target.y - g.y;
    const d = Math.hypot(dx, dy);
    if (d > this.visionRange) return false;
    if (Math.abs(angleDiff(Math.atan2(dy, dx), g.angle)) > this.halfFov) return false;
    return this.grid.castRay(g.x, g.y, dx / d, dy / d, d) >= d - 1;
  }

  private updateGuard(g: Guard, dt: number): void {
    if (g.state === "dead") {
      g.deadT += dt;
      return;
    }
    const p = this.player;
    const sees = this.canSee(g, p);

    if (sees) {
      if (g.state !== "alert") {
        g.state = "alert";
        g.fireCd = Math.max(g.fireCd, 0.3);
        g.path = [];
      }
      g.lastSeen = { x: p.x, y: p.y };
      g.searchT = 0;
    }

    switch (g.state) {
      case "alert": {
        if (sees) {
          g.angle = turnToward(g.angle, Math.atan2(p.y - g.y, p.x - g.x), 10 * dt);
          g.fireCd -= dt;
          if (g.fireCd <= 0) {
            this.shoot(g);
            g.fireCd = this.fireInterval;
          }
        } else {
          // Lost sight: run to where the player was last seen.
          g.state = "search";
          g.searchT = 0;
          g.path = (g.lastSeen && this.grid.findPath(g, g.lastSeen, GUARD_RADIUS)) || [];
        }
        break;
      }
      case "search": {
        if (g.path.length) {
          this.followPath(g, this.alertSpeed, dt);
        } else {
          g.searchT += dt;
          g.angle += Math.sin(g.searchT * 3) * 3 * dt;
          if (g.searchT > 2.5) {
            g.state = "patrol";
            g.wait = 0.5;
          }
        }
        break;
      }
      case "patrol": {
        if (g.path.length) {
          this.followPath(g, this.patrolSpeed, dt);
        } else {
          g.wait -= dt;
          g.lookT += dt;
          g.angle = g.lookBase + Math.sin(g.lookT * 1.4) * 0.9;
          if (g.wait <= 0) this.pickPatrol(g);
        }
        break;
      }
    }
  }

  private pickPatrol(g: Guard): void {
    const range = 8;
    const tx = Math.floor(g.x / TILE) + Math.round((this.rng() * 2 - 1) * range);
    const ty = Math.floor(g.y / TILE) + Math.round((this.rng() * 2 - 1) * range);
    if (this.grid.isWall(tx, ty)) {
      g.wait = 0.3;
      return;
    }
    g.path = this.grid.findPath(g, this.grid.center(tx, ty), GUARD_RADIUS) ?? [];
    g.wait = 1 + this.rng() * 2.5;
  }

  private followPath(g: Guard, speed: number, dt: number): void {
    const wp = g.path[0];
    const dx = wp.x - g.x;
    const dy = wp.y - g.y;
    const d = Math.hypot(dx, dy);
    if (d < 4) {
      g.path.shift();
      if (!g.path.length) g.lookBase = g.angle;
      return;
    }
    const step = Math.min(d, speed * dt);
    g.stride += moveCircle(this.grid, g, (dx / d) * step, (dy / d) * step, GUARD_RADIUS);
    g.angle = turnToward(g.angle, Math.atan2(dy, dx), 6 * dt);
  }

  private shoot(g: Guard): void {
    const spread = (this.rng() - 0.5) * 0.12;
    const a = g.angle + spread;
    const mx = g.x + Math.cos(a) * 16;
    const my = g.y + Math.sin(a) * 16;
    this.bullets.push({ x: mx, y: my, vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED, life: 1.2 });

    // Gunfire draws nearby guards over to investigate.
    const hear = TILE * 7;
    for (const o of this.guards) {
      if (o === g || o.state === "dead" || o.state === "alert") continue;
      if (Math.hypot(o.x - g.x, o.y - g.y) > hear) continue;
      o.state = "search";
      o.searchT = 0;
      o.lastSeen = { x: this.player.x, y: this.player.y };
      o.path = this.grid.findPath(o, o.lastSeen, GUARD_RADIUS) ?? [];
    }
  }

  private checkKills(): void {
    const p = this.player;
    for (const g of this.guards) {
      if (g.state === "dead") continue;
      if (Math.hypot(g.x - p.x, g.y - p.y) > KILL_RANGE) continue;
      g.state = "dead";
      g.deadT = 0;
      g.path = [];
      this.kills++;
      p.lungeT = 0.15;
      p.angle = Math.atan2(g.y - p.y, g.x - p.x);
      this.splats.push({ x: g.x, y: g.y, r: 10 + this.rng() * 8, seed: Math.floor(this.rng() * 1e9) });
      this.effects.push({ kind: "slash", x: g.x, y: g.y, angle: p.angle, t: 0 });
      this.shake = Math.max(this.shake, 6);
      const n = 3 + Math.floor(this.rng() * 3);
      this.effects.push({ kind: "text", x: g.x, y: g.y - 18, angle: 0, t: 0, text: `+${n}` });
      for (let k = 0; k < n; k++) {
        const a = this.rng() * Math.PI * 2;
        const s = 60 + this.rng() * 90;
        this.gems.push({ x: g.x, y: g.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0 });
      }
    }
  }

  private updateBullets(dt: number): void {
    const p = this.player;
    let w = 0;
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || this.grid.wallAt(b.x, b.y)) continue;
      if (this.outcome === "playing" && Math.hypot(b.x - p.x, b.y - p.y) < PLAYER_RADIUS + 3) {
        if (!this.opts.invulnerable) {
          p.hp = Math.max(0, p.hp - BULLET_DAMAGE);
          p.hurtT = 0.25;
          this.shake = Math.max(this.shake, 4);
          if (p.hp === 0) this.outcome = "lost";
        }
        continue;
      }
      this.bullets[w++] = b;
    }
    this.bullets.length = w;
  }

  private updateGems(dt: number): void {
    const p = this.player;
    let w = 0;
    for (const gem of this.gems) {
      gem.t += dt;
      if (gem.t < 0.5) {
        gem.x += gem.vx * dt;
        gem.y += gem.vy * dt;
        gem.vx *= 0.9;
        gem.vy *= 0.9;
      } else {
        // Fly into the player.
        const dx = p.x - gem.x;
        const dy = p.y - gem.y;
        const d = Math.hypot(dx, dy);
        const s = 300 + gem.t * 500;
        if (d < 10) {
          this.gemsCollected++;
          continue;
        }
        gem.x += (dx / d) * Math.min(d, s * dt);
        gem.y += (dy / d) * Math.min(d, s * dt);
      }
      this.gems[w++] = gem;
    }
    this.gems.length = w;
  }

  /** Vision cone outline as world-space points, clipped by walls. */
  visionPolygon(g: Guard, rays: number): number[] {
    const pts = [g.x, g.y];
    for (let i = 0; i <= rays; i++) {
      const a = g.angle - this.halfFov + (2 * this.halfFov * i) / rays;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const d = this.grid.castRay(g.x, g.y, dx, dy, this.visionRange);
      pts.push(g.x + dx * d, g.y + dy * d);
    }
    return pts;
  }
}

/** Moves a circle with wall sliding; returns the distance actually travelled. */
function moveCircle(grid: Grid, e: Vec, dx: number, dy: number, r: number): number {
  const x0 = e.x;
  const y0 = e.y;
  if (grid.circleFree(e.x + dx, e.y, r)) e.x += dx;
  if (grid.circleFree(e.x, e.y + dy, r)) e.y += dy;
  return Math.hypot(e.x - x0, e.y - y0);
}

export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnToward(current: number, target: number, maxStep: number): number {
  const d = angleDiff(target, current);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}
