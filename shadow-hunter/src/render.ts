import { Game, Guard } from "./game";
import { TILE, Vec, mulberry32 } from "./map";

export interface View {
  scale: number;
  ox: number;
  oy: number;
}

interface Theme {
  floor: string;
  floorAlt: string;
  grout: string;
  top: string;
  topEdge: string;
  front: string;
  frontDark: string;
  dark: string;
}

/** One palette per level, cycling, so each level looks like a new place. */
const THEMES: Theme[] = [
  { floor: "#3a3f4b", floorAlt: "#363a46", grout: "#2c303a", top: "#86d6c8", topEdge: "#c9f4ec", front: "#4c9488", frontDark: "#2f6b62", dark: "rgba(5,7,15,0.62)" },
  { floor: "#433d38", floorAlt: "#3f3934", grout: "#332e2a", top: "#f0c674", topEdge: "#fde7b5", front: "#b98a3c", frontDark: "#80602a", dark: "rgba(10,7,4,0.6)" },
  { floor: "#3d3a48", floorAlt: "#393644", grout: "#2e2b38", top: "#ee8f8f", topEdge: "#ffd0d0", front: "#a85656", frontDark: "#743a3a", dark: "rgba(8,5,12,0.62)" },
  { floor: "#363d4c", floorAlt: "#333948", grout: "#2a303d", top: "#a8b6f6", topEdge: "#dde3ff", front: "#5d6bb3", frontDark: "#3f4a85", dark: "rgba(4,6,16,0.64)" },
  { floor: "#393f3a", floorAlt: "#353b36", grout: "#2c312d", top: "#b4dc7a", topEdge: "#e2f6c3", front: "#6e9a3c", frontDark: "#4b6c27", dark: "rgba(4,8,5,0.6)" },
];

/** How tall walls look, in world pixels. */
const WALL_H = 14;
/** Most tiles shown along the long side of the screen before the camera starts following the player. */
const VIEW_TILES = 16;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private light: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private floorLayer: HTMLCanvasElement | null = null;
  private wallLayer: HTMLCanvasElement | null = null;
  private layerGrid: unknown = null;
  private theme: Theme = THEMES[0];
  private cam: Vec | null = null;
  view: View = { scale: 1, ox: 0, oy: 0 };
  marker: { x: number; y: number; t: number } | null = null;
  /** Show the whole map instead of following the player (bench mode). */
  fitWholeMap = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.light = document.createElement("canvas");
    this.lctx = this.light.getContext("2d")!;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
    this.light.width = this.canvas.width;
    this.light.height = this.canvas.height;
  }

  toWorld(clientX: number, clientY: number): Vec {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / rect.width;
    const v = this.view;
    return {
      x: ((clientX - rect.left) * dpr - v.ox) / v.scale,
      y: ((clientY - rect.top) * dpr - v.oy) / v.scale,
    };
  }

  private updateView(game: Game, dt: number): void {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const dpr = cw / Math.max(1, this.canvas.clientWidth);
    const top = 64 * dpr;
    const pad = 10 * dpr;
    const ww = game.grid.w * TILE;
    const wh = game.grid.h * TILE;
    const aw = cw - pad * 2;
    const ah = ch - top - pad;
    const fitScale = Math.min(aw / ww, ah / wh);
    // Fill the screen with the map (no empty bars), but never show more than VIEW_TILES on the long side.
    const coverScale = Math.max(aw / ww, ah / wh);
    const followScale = Math.max(aw, ah) / (TILE * VIEW_TILES);
    const scale = this.fitWholeMap ? fitScale : Math.max(fitScale, Math.min(coverScale, followScale));

    const p = game.player;
    if (!this.cam || dt === 0) this.cam = { x: p.x, y: p.y };
    const k = Math.min(1, dt * 7);
    this.cam.x += (p.x - this.cam.x) * k;
    this.cam.y += (p.y - this.cam.y) * k;

    // Keep the camera inside the map; centre any axis the map doesn't fill.
    const halfW = aw / 2 / scale;
    const halfH = ah / 2 / scale;
    const cx = ww <= halfW * 2 ? ww / 2 : Math.max(halfW, Math.min(ww - halfW, this.cam.x));
    const cy = wh <= halfH * 2 ? wh / 2 : Math.max(halfH - WALL_H, Math.min(wh - halfH, this.cam.y));

    const shake = game.shake * dpr;
    this.view = {
      scale,
      ox: cw / 2 - cx * scale + (Math.random() - 0.5) * shake,
      oy: top + ah / 2 - cy * scale + (Math.random() - 0.5) * shake,
    };
  }

  private buildLayers(game: Game): void {
    const g = game.grid;
    const t = THEMES[(game.opts.level - 1) % THEMES.length];
    this.theme = t;

    const floor = document.createElement("canvas");
    floor.width = g.w * TILE;
    floor.height = g.h * TILE;
    const f = floor.getContext("2d")!;
    f.fillStyle = t.grout;
    f.fillRect(0, 0, floor.width, floor.height);
    for (let ty = 0; ty < g.h; ty++) {
      for (let tx = 0; tx < g.w; tx++) {
        f.fillStyle = (tx + ty) % 2 === 0 ? t.floor : t.floorAlt;
        f.fillRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
      }
    }
    // Soft contact shadow cast down-right by each block.
    f.fillStyle = "rgba(0,0,0,0.32)";
    for (let ty = 0; ty < g.h; ty++)
      for (let tx = 0; tx < g.w; tx++) if (g.isWall(tx, ty)) f.fillRect(tx * TILE + 7, ty * TILE + 5, TILE, TILE);

    const walls = document.createElement("canvas");
    walls.width = g.w * TILE;
    walls.height = g.h * TILE + WALL_H;
    const w = walls.getContext("2d")!;
    for (let ty = 0; ty < g.h; ty++) {
      for (let tx = 0; tx < g.w; tx++) {
        if (!g.isWall(tx, ty)) continue;
        const x = tx * TILE;
        const y = ty * TILE + WALL_H; // layer is shifted down by WALL_H
        if (!g.isWall(tx, ty + 1) && ty + 1 < g.h) {
          const grad = w.createLinearGradient(0, y + TILE - WALL_H, 0, y + TILE);
          grad.addColorStop(0, t.front);
          grad.addColorStop(1, t.frontDark);
          w.fillStyle = grad;
          w.fillRect(x, y + TILE - WALL_H, TILE, WALL_H);
        }
        w.fillStyle = t.top;
        w.fillRect(x, y - WALL_H, TILE, TILE);
        w.fillStyle = t.topEdge;
        if (!g.isWall(tx, ty - 1)) w.fillRect(x, y - WALL_H, TILE, 3);
        if (!g.isWall(tx - 1, ty)) w.fillRect(x, y - WALL_H, 2, TILE);
        w.fillStyle = "rgba(0,0,0,0.12)";
        if (!g.isWall(tx + 1, ty)) w.fillRect(x + TILE - 2, y - WALL_H, 2, TILE);
      }
    }

    this.floorLayer = floor;
    this.wallLayer = walls;
    this.layerGrid = game.grid;
    this.cam = null;
  }

  draw(game: Game, rays: number, dt: number): void {
    if (this.layerGrid !== game.grid) this.buildLayers(game);
    this.updateView(game, dt);
    const ctx = this.ctx;
    const v = this.view;
    const t = this.theme;

    // Visible world rectangle, for culling.
    const m = TILE * 2;
    const vx0 = -v.ox / v.scale - m;
    const vy0 = -v.oy / v.scale - m;
    const vx1 = (this.canvas.width - v.ox) / v.scale + m;
    const vy1 = (this.canvas.height - v.oy) / v.scale + m;
    const onScreen = (x: number, y: number, r = 0) => x > vx0 - r && x < vx1 + r && y > vy0 - r && y < vy1 + r;
    const coneR = game.visionRange;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0d0f16";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(v.scale, 0, 0, v.scale, v.ox, v.oy);
    ctx.drawImage(this.floorLayer!, 0, 0);

    for (const s of game.splats) if (onScreen(s.x, s.y)) this.drawSplat(s.x, s.y, s.r, s.seed);

    // Cone polygons are shared by the darkness cut-out and the warm tint.
    const cones: { g: Guard; pts: number[] }[] = [];
    for (const g of game.guards) {
      if (g.state === "dead" || !onScreen(g.x, g.y, coneR)) continue;
      cones.push({ g, pts: game.visionPolygon(g, rays) });
    }

    // Per-cone gradients get expensive with big crowds; fall back to flat fills.
    const cheap = cones.length > 60;

    // Darkness with flashlight cones and a glow around the player cut out of it.
    const l = this.lctx;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = "source-over";
    l.clearRect(0, 0, this.light.width, this.light.height);
    l.fillStyle = t.dark;
    l.fillRect(0, 0, this.light.width, this.light.height);
    l.setTransform(v.scale, 0, 0, v.scale, v.ox, v.oy);
    l.globalCompositeOperation = "destination-out";
    if (cheap) {
      l.fillStyle = "rgba(0,0,0,0.8)";
      l.beginPath();
      for (const { pts } of cones) addPolygon(l, pts);
      l.fill();
    } else {
      for (const { g, pts } of cones) {
        const grad = l.createRadialGradient(g.x, g.y, 0, g.x, g.y, coneR);
        grad.addColorStop(0, "rgba(0,0,0,1)");
        grad.addColorStop(1, "rgba(0,0,0,0.55)");
        l.fillStyle = grad;
        polygon(l, pts);
        l.fill();
      }
    }
    const p = game.player;
    const glow = l.createRadialGradient(p.x, p.y, 0, p.x, p.y, TILE * 3);
    glow.addColorStop(0, "rgba(0,0,0,0.75)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    l.fillStyle = glow;
    l.fillRect(p.x - TILE * 3, p.y - TILE * 3, TILE * 6, TILE * 6);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.light, 0, 0);
    ctx.setTransform(v.scale, 0, 0, v.scale, v.ox, v.oy);

    if (cheap) {
      ctx.fillStyle = "rgba(255,235,150,0.18)";
      ctx.beginPath();
      for (const { g, pts } of cones) if (g.state === "patrol") addPolygon(ctx, pts);
      ctx.fill();
    }
    for (const { g, pts } of cones) {
      if (cheap) {
        if (g.state === "patrol") continue;
        ctx.fillStyle = g.state === "alert" ? "rgba(255,70,60,0.3)" : "rgba(255,160,60,0.24)";
        polygon(ctx, pts);
        ctx.fill();
        continue;
      }
      const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, coneR);
      const c = g.state === "alert" ? "255,70,60" : g.state === "search" ? "255,160,60" : "255,235,150";
      grad.addColorStop(0, `rgba(${c},0.42)`);
      grad.addColorStop(1, `rgba(${c},0.06)`);
      ctx.fillStyle = grad;
      polygon(ctx, pts);
      ctx.fill();
    }

    if (this.marker) {
      const mk = this.marker;
      const k = Math.min(1, mk.t / 0.4);
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(mk.x, mk.y, 5 + k * 12, (5 + k * 12) * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const g of game.guards) if (g.state === "dead" && onScreen(g.x, g.y)) this.drawDeadGuard(g);

    for (const gem of game.gems) if (onScreen(gem.x, gem.y)) this.drawGem(gem.x, gem.y, gem.t);

    ctx.lineCap = "round";
    for (const b of game.bullets) {
      if (!onScreen(b.x, b.y)) continue;
      ctx.strokeStyle = "rgba(255,240,170,0.95)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.stroke();
    }

    for (const g of game.guards) if (g.state !== "dead" && onScreen(g.x, g.y)) this.drawGuard(g);
    this.drawPlayer(game);

    for (const e of game.effects) if (e.kind === "slash") this.drawSlash(e.x, e.y, e.angle, e.t);

    // Blocks go on top of characters so they hide anyone standing just behind them.
    ctx.drawImage(this.wallLayer!, 0, -WALL_H);

    for (const g of game.guards) {
      if (g.state === "dead" || g.state === "patrol" || !onScreen(g.x, g.y)) continue;
      this.drawBubble(g.x, g.y - 26, g.state === "alert" ? "!" : "?", g.state === "alert" ? "#ff3b3b" : "#ff9f2e");
    }
    this.drawHealth(p.x, p.y - 24, p.hp);
    for (const e of game.effects) if (e.kind === "text") this.drawFloatText(e.x, e.y, e.t, e.text ?? "");
  }

  private drawSplat(x: number, y: number, r: number, seed: number): void {
    const ctx = this.ctx;
    const rnd = mulberry32(seed);
    ctx.fillStyle = "rgba(170,20,35,0.75)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2;
      const d = r * (0.8 + rnd() * 0.9);
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.5 + rnd() * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Top-down person facing +x: feet, shoulders, arms and head. */
  private drawPerson(
    x: number,
    y: number,
    angle: number,
    stride: number,
    body: string,
    bodyDark: string,
    head: string,
    hat: string,
    extra: (ctx: CanvasRenderingContext2D) => void,
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(3, 4, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(angle);
    const swing = Math.sin(stride * 0.22) * 5;
    ctx.fillStyle = "#15161b";
    ctx.beginPath();
    ctx.ellipse(swing, -5, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(-swing, 5, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    extra(ctx);
    ctx.fillStyle = bodyDark;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8.5, 12.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0.5, 0, 7, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(1, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hat;
    ctx.beginPath();
    ctx.arc(0, 0, 6.3, Math.PI * 0.55, Math.PI * 1.45);
    ctx.fill();
    ctx.restore();
  }

  private drawGuard(g: Guard): void {
    const alert = g.state === "alert";
    this.drawPerson(g.x, g.y, g.angle, g.stride, alert ? "#c9583e" : "#6f8a3d", alert ? "#8a3826" : "#4b5e28", "#f0c9a0", "#2f3b1a", (ctx) => {
      // Rifle held forward in both hands.
      ctx.fillStyle = "#1b1c20";
      ctx.fillRect(4, 1, 18, 4);
      ctx.fillStyle = "#f0c9a0";
      ctx.beginPath();
      ctx.arc(8, 4, 2.6, 0, Math.PI * 2);
      ctx.arc(15, 3, 2.6, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawDeadGuard(g: Guard): void {
    const ctx = this.ctx;
    const k = Math.min(1, g.deadT / 0.25);
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.angle + Math.PI + k * 0.6);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#4b5e28";
    ctx.beginPath();
    ctx.ellipse(-4 * k, 0, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d6b089";
    ctx.beginPath();
    ctx.arc(-14 * k - 2, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1b1c20";
    ctx.fillRect(6, 6, 16, 4);
    ctx.restore();
  }

  private drawPlayer(game: Game): void {
    const p = game.player;
    const time = game.time;
    const lunge = p.lungeT > 0;
    const hurt = p.hurtT > 0;
    this.drawPerson(p.x, p.y, p.angle, p.stride, hurt ? "#ff6b6b" : "#2a2d38", "#121319", "#1a1b22", "#1a1b22", (ctx) => {
      // Headband tails flutter behind.
      ctx.strokeStyle = "#e3263b";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      const f = Math.sin(time * 14) * 3;
      ctx.beginPath();
      ctx.moveTo(-5, -1);
      ctx.quadraticCurveTo(-12, -3 + f, -18, -2 - f);
      ctx.moveTo(-5, 1);
      ctx.quadraticCurveTo(-11, 4 - f, -16, 5 + f);
      ctx.stroke();
      // Blade.
      ctx.strokeStyle = "#e6ecf5";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(4, 9);
      ctx.lineTo(lunge ? 26 : 16, lunge ? 4 : 12);
      ctx.stroke();
    });
    // Headband stripe drawn over the head.
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = "#e3263b";
    ctx.fillRect(-2, -6, 3, 12);
    ctx.restore();
  }

  private drawGem(x: number, y: number, t: number): void {
    const ctx = this.ctx;
    const bob = t < 0.5 ? -Math.sin((t / 0.5) * Math.PI) * 10 : 0;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = "rgba(80,230,255,0.25)";
    diamond(ctx, 10);
    ctx.fill();
    ctx.fillStyle = "#43e3ff";
    diamond(ctx, 6.5);
    ctx.fill();
    ctx.fillStyle = "#c9f8ff";
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(3, -1);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawSlash(x: number, y: number, angle: number, t: number): void {
    const ctx = this.ctx;
    const k = t / 0.25;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = `rgba(255,255,255,${1 - k})`;
    ctx.lineWidth = 4 * (1 - k) + 1;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(-6, 0, 16 + k * 8, -1.2, -1.2 + 2.4 * Math.min(1, k * 2.5));
    ctx.stroke();
    ctx.restore();
  }

  private drawBubble(x: number, y: number, text: string, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "900 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y + 0.5);
  }

  private drawHealth(x: number, y: number, hp: number): void {
    const ctx = this.ctx;
    const w = 30;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = hp > 50 ? "#4ade80" : hp > 25 ? "#facc15" : "#ef4444";
    ctx.fillRect(x - w / 2, y, (w * hp) / 100, 4);
  }

  private drawFloatText(x: number, y: number, t: number, text: string): void {
    const ctx = this.ctx;
    const k = t / 0.9;
    ctx.globalAlpha = 1 - k * k;
    ctx.font = "900 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.strokeText(`${text} ◆`, x, y - k * 22);
    ctx.fillStyle = "#43e3ff";
    ctx.fillText(`${text} ◆`, x, y - k * 22);
    ctx.globalAlpha = 1;
  }
}

function polygon(ctx: CanvasRenderingContext2D, pts: number[]): void {
  ctx.beginPath();
  addPolygon(ctx, pts);
}

function addPolygon(ctx: CanvasRenderingContext2D, pts: number[]): void {
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

function diamond(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.75, 0);
  ctx.lineTo(0, r);
  ctx.lineTo(-r * 0.75, 0);
  ctx.closePath();
}
