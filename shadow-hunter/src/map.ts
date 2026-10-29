export const TILE = 32;

export interface Vec {
  x: number;
  y: number;
}

/** Small deterministic PRNG so a level number always produces the same map. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Grid {
  readonly cells: Uint8Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cells = new Uint8Array(w * h);
  }

  isWall(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    return this.cells[ty * this.w + tx] === 1;
  }

  wallAt(x: number, y: number): boolean {
    return this.isWall(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  center(tx: number, ty: number): Vec {
    return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }

  /** True if a circle of radius r at (x, y) overlaps no wall tile. */
  circleFree(x: number, y: number, r: number): boolean {
    const x0 = Math.floor((x - r) / TILE);
    const x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r) / TILE);
    const y1 = Math.floor((y + r) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.isWall(tx, ty)) continue;
        const cx = Math.max(tx * TILE, Math.min(x, (tx + 1) * TILE));
        const cy = Math.max(ty * TILE, Math.min(y, (ty + 1) * TILE));
        if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return false;
      }
    }
    return true;
  }

  /** Distance along a unit direction (dx, dy) until a wall, capped at maxDist (grid DDA). */
  castRay(ox: number, oy: number, dx: number, dy: number, maxDist: number): number {
    let tx = Math.floor(ox / TILE);
    let ty = Math.floor(oy / TILE);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
    let tMaxX = dx > 0 ? ((tx + 1) * TILE - ox) / dx : dx < 0 ? (tx * TILE - ox) / dx : Infinity;
    let tMaxY = dy > 0 ? ((ty + 1) * TILE - oy) / dy : dy < 0 ? (ty * TILE - oy) / dy : Infinity;
    let t = 0;
    while (t < maxDist) {
      if (tMaxX < tMaxY) {
        tx += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
      } else {
        ty += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
      }
      if (this.isWall(tx, ty)) return Math.min(t, maxDist);
    }
    return maxDist;
  }

  lineOfSight(a: Vec, b: Vec): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d < 1) return true;
    return this.castRay(a.x, a.y, (b.x - a.x) / d, (b.y - a.y) / d, d) >= d;
  }

  /** True if a circle of radius r can slide in a straight line from a to b. */
  segmentClear(a: Vec, b: Vec, r: number): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(d / 6));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.circleFree(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, r)) return false;
    }
    return true;
  }

  /** 8-directional A* without corner cutting. Returns smoothed world-space waypoints, or null. */
  findPath(from: Vec, to: Vec, radius: number): Vec[] | null {
    const sx = Math.floor(from.x / TILE);
    const sy = Math.floor(from.y / TILE);
    let gx = Math.floor(to.x / TILE);
    let gy = Math.floor(to.y / TILE);
    if (this.isWall(gx, gy)) {
      const near = this.nearestOpen(gx, gy);
      if (!near) return null;
      [gx, gy] = near;
    }
    const n = this.w * this.h;
    const start = sy * this.w + sx;
    const goal = gy * this.w + gx;
    if (start === goal) return [this.center(gx, gy)];

    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const hfn = (i: number) => {
      const ddx = Math.abs((i % this.w) - gx);
      const ddy = Math.abs(Math.floor(i / this.w) - gy);
      return Math.max(ddx, ddy) + 0.414 * Math.min(ddx, ddy);
    };
    g[start] = 0;
    heap.push(start, hfn(start));

    while (heap.size > 0) {
      const cur = heap.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % this.w;
      const cy = (cur - cx) / this.w;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nx = cx + ox;
          const ny = cy + oy;
          if (this.isWall(nx, ny)) continue;
          if (ox !== 0 && oy !== 0 && (this.isWall(cx + ox, cy) || this.isWall(cx, cy + oy))) continue;
          const ni = ny * this.w + nx;
          const cost = g[cur] + (ox !== 0 && oy !== 0 ? 1.414 : 1);
          if (cost < g[ni]) {
            g[ni] = cost;
            came[ni] = cur;
            heap.push(ni, cost + hfn(ni));
          }
        }
      }
    }
    if (came[goal] === -1) return null;

    const tiles: Vec[] = [];
    for (let i = goal; i !== start; i = came[i]) tiles.push(this.center(i % this.w, Math.floor(i / this.w)));
    tiles.reverse();

    // String-pull: skip waypoints we can walk straight past.
    const out: Vec[] = [];
    let anchor: Vec = from;
    let i = 0;
    while (i < tiles.length) {
      let j = tiles.length - 1;
      while (j > i && !this.segmentClear(anchor, tiles[j], radius)) j--;
      out.push(tiles[j]);
      anchor = tiles[j];
      i = j + 1;
    }
    return out;
  }

  nearestOpen(tx: number, ty: number): [number, number] | null {
    for (let r = 1; r < Math.max(this.w, this.h); r++) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          if (!this.isWall(tx + ox, ty + oy)) return [tx + ox, ty + oy];
        }
      }
    }
    return null;
  }

  openTiles(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === 0) out.push(i);
    return out;
  }
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, key: number): void {
    const ids = this.ids;
    const keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }

  pop(): number {
    const ids = this.ids;
    const keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastKey = keys.pop()!;
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        ids[i] = ids[c];
        keys[i] = keys[c];
        i = c;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}

export interface LevelMap {
  grid: Grid;
  spawn: Vec;
}

/** Builds a tall (portrait) walled arena for a level. Bigger levels and bigger crowds get bigger maps. */
export function generateMap(level: number, guardCount: number): LevelMap {
  const rng = mulberry32(level * 7919 + 17);
  const aspect = 1.6; // height / width
  const growth = Math.min(level, 12);
  const baseW = 13 + Math.round(growth * 0.6);
  const baseH = 21 + growth;
  const needed = guardCount * 40;
  const w = Math.max(baseW, Math.ceil(Math.sqrt(needed / aspect)));
  const h = Math.max(baseH, Math.ceil(w * aspect));
  const grid = new Grid(w, h);

  for (let x = 0; x < w; x++) {
    grid.cells[x] = 1;
    grid.cells[(h - 1) * w + x] = 1;
  }
  for (let y = 0; y < h; y++) {
    grid.cells[y * w] = 1;
    grid.cells[y * w + w - 1] = 1;
  }

  const spawnTx = Math.floor(w / 2);
  const spawnTy = h - 3;
  const blocks = Math.floor((w * h) / 20);
  for (let b = 0; b < blocks; b++) {
    const long = rng() < 0.35;
    const bw = long ? (rng() < 0.5 ? 1 : 2 + Math.floor(rng() * 5)) : 1 + Math.floor(rng() * 3);
    const bh = long ? (bw === 1 ? 2 + Math.floor(rng() * 5) : 1) : 1 + Math.floor(rng() * 3);
    const bx = 1 + Math.floor(rng() * (w - 2 - bw));
    const by = 1 + Math.floor(rng() * (h - 2 - bh));
    if (bx <= spawnTx + 2 && bx + bw >= spawnTx - 1 && by <= spawnTy + 2 && by + bh >= spawnTy - 2) continue;
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) grid.cells[y * w + x] = 1;
  }

  // Wall off anything the player can't reach, so every guard is killable.
  const seen = new Uint8Array(w * h);
  const stack = [spawnTy * w + spawnTx];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    for (const [ox, oy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = (y + oy) * w + x + ox;
      if (!grid.isWall(x + ox, y + oy) && !seen[ni]) {
        seen[ni] = 1;
        stack.push(ni);
      }
    }
  }
  for (let i = 0; i < w * h; i++) if (!seen[i]) grid.cells[i] = 1;

  return { grid, spawn: grid.center(spawnTx, spawnTy) };
}
