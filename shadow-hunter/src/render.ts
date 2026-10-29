import { GUARD_RADIUS, Game, PLAYER_RADIUS } from "./game";
import { TILE, Vec } from "./map";

export interface View {
  scale: number;
  ox: number;
  oy: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private staticLayer: HTMLCanvasElement | null = null;
  private staticVersion = -1;
  private staticGrid: unknown = null;
  view: View = { scale: 1, ox: 0, oy: 0 };
  marker: { x: number; y: number; t: number } | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
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

  private fit(game: Game): void {
    const ww = game.grid.w * TILE;
    const wh = game.grid.h * TILE;
    const pad = 12 * (this.canvas.width / Math.max(1, this.canvas.clientWidth));
    const top = 56 * (this.canvas.width / Math.max(1, this.canvas.clientWidth));
    const aw = this.canvas.width - pad * 2;
    const ah = this.canvas.height - pad - top;
    const scale = Math.min(aw / ww, ah / wh);
    this.view = {
      scale,
      ox: (this.canvas.width - ww * scale) / 2,
      oy: top + (ah - wh * scale) / 2,
    };
  }

  private buildStatic(game: Game): void {
    const g = game.grid;
    const c = document.createElement("canvas");
    c.width = g.w * TILE;
    c.height = g.h * TILE;
    const x = c.getContext("2d")!;
    x.fillStyle = "#3a4152";
    x.fillRect(0, 0, c.width, c.height);
    for (let ty = 0; ty < g.h; ty++) {
      for (let tx = 0; tx < g.w; tx++) {
        if (g.isWall(tx, ty)) continue;
        x.fillStyle = (tx + ty) % 2 === 0 ? "#454d60" : "#414859";
        x.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
    // Wall shadow, then wall body with a lit top edge for a bit of depth.
    x.fillStyle = "rgba(0,0,0,0.28)";
    for (let ty = 0; ty < g.h; ty++)
      for (let tx = 0; tx < g.w; tx++) if (g.isWall(tx, ty)) x.fillRect(tx * TILE + 5, ty * TILE + 6, TILE, TILE);
    for (let ty = 0; ty < g.h; ty++) {
      for (let tx = 0; tx < g.w; tx++) {
        if (!g.isWall(tx, ty)) continue;
        x.fillStyle = "#1b1f2a";
        x.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        x.fillStyle = "#2a3040";
        x.fillRect(tx * TILE, ty * TILE, TILE, TILE - 6);
        if (!g.isWall(tx, ty - 1)) {
          x.fillStyle = "#59627a";
          x.fillRect(tx * TILE, ty * TILE, TILE, 3);
        }
      }
    }
    this.staticLayer = c;
    this.staticVersion = game.mapVersion;
    this.staticGrid = game.grid;
  }

  draw(game: Game, rays: number): void {
    const ctx = this.ctx;
    if (!this.staticLayer || this.staticVersion !== game.mapVersion || this.staticGrid !== game.grid) this.buildStatic(game);
    this.fit(game);
    const v = this.view;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#151821";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(v.scale, 0, 0, v.scale, v.ox, v.oy);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.staticLayer!, 0, 0);

    for (const s of game.splats) {
      ctx.fillStyle = "rgba(150,20,30,0.55)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Vision cones.
    for (const g of game.guards) {
      if (g.state === "dead") continue;
      const pts = game.visionPolygon(g, rays);
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
      ctx.fillStyle =
        g.state === "alert" ? "rgba(255,60,60,0.30)" : g.state === "search" ? "rgba(255,150,40,0.24)" : "rgba(255,230,120,0.17)";
      ctx.fill();
    }

    if (this.marker) {
      const m = this.marker;
      const k = Math.min(1, m.t / 0.4);
      ctx.strokeStyle = `rgba(120,220,255,${1 - k})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 6 + k * 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const g of game.guards) this.drawGuard(g.x, g.y, g.angle, g.state, g.deadT);

    ctx.fillStyle = "#ffe36b";
    for (const b of game.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const gem of game.gems) {
      ctx.save();
      ctx.translate(gem.x, gem.y);
      ctx.rotate(gem.t * 4);
      ctx.fillStyle = "#4ff0ff";
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(5, 0);
      ctx.lineTo(0, 6);
      ctx.lineTo(-5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const p = game.player;
    if (p.path.length && !game.opts.autopilot) {
      ctx.strokeStyle = "rgba(120,220,255,0.35)";
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      for (const wp of p.path) ctx.lineTo(wp.x, wp.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    this.drawPlayer(p.x, p.y, p.angle, p.hurtT > 0, p.lungeT > 0);
  }

  private drawGuard(x: number, y: number, a: number, state: string, deadT: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    if (state === "dead") {
      const k = Math.min(1, deadT / 0.25);
      ctx.rotate(a + k * 1.2);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#6b5a48";
      ctx.beginPath();
      ctx.ellipse(0, 0, GUARD_RADIUS * (1 + 0.3 * k), GUARD_RADIUS * (1 - 0.35 * k), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.rotate(a);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(6, 2, 14, 4); // rifle
    ctx.fillStyle = state === "alert" ? "#e5533d" : "#d79a3a";
    ctx.beginPath();
    ctx.arc(0, 0, GUARD_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2d2a9";
    ctx.beginPath();
    ctx.arc(2, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (state === "alert") {
      ctx.fillStyle = "#ff4646";
      ctx.font = "bold 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("!", x, y - 16);
    } else if (state === "search") {
      ctx.fillStyle = "#ffae3d";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("?", x, y - 16);
    }
  }

  private drawPlayer(x: number, y: number, a: number, hurt: boolean, lunging: boolean): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = "#c9d1e0";
    ctx.fillRect(4, -9, lunging ? 16 : 11, 2.5); // blade
    ctx.fillStyle = hurt ? "#ff6b6b" : "#101218";
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d8283a";
    ctx.fillRect(-PLAYER_RADIUS - 6, -2, 9, 4); // scarf tail
    ctx.fillRect(-3, -PLAYER_RADIUS + 1, 3, PLAYER_RADIUS * 2 - 2); // headband
    ctx.restore();
  }
}
