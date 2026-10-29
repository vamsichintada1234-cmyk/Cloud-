import * as THREE from "three";
import type { Effect, Game, Guard } from "./game";
import { Grid, TILE, Vec, mulberry32 } from "./map";

/** Game coordinates are pixels with 32 px per tile; the 3D scene uses 1 unit per tile (x -> x, y -> z). */
const S = 1 / TILE;
const WALL_H = 1.15;

interface Theme {
  wall: number;
  wallTop: number;
  floorA: string;
  floorB: string;
  grout: string;
  bg: number;
}

/** One palette per level, cycling, so each level looks like a new place. */
const THEMES: Theme[] = [
  { wall: 0x3f7a71, wallTop: 0x9ee0d2, floorA: "#4a505c", floorB: "#454b57", grout: "#30343d", bg: 0x0b0e14 },
  { wall: 0x8a6735, wallTop: 0xf0d08f, floorA: "#514a42", floorB: "#4b453e", grout: "#36312b", bg: 0x0f0c09 },
  { wall: 0x84433e, wallTop: 0xf0a397, floorA: "#4b4752", floorB: "#46424d", grout: "#322f37", bg: 0x0e0b11 },
  { wall: 0x47528f, wallTop: 0xb3bef5, floorA: "#454c5a", floorB: "#414755", grout: "#2e333e", bg: 0x0a0c15 },
  { wall: 0x557637, wallTop: 0xbfe28c, floorA: "#484e46", floorB: "#434942", grout: "#2f342e", bg: 0x0a0f0a },
];

// Shared geometry. Characters are built facing +x, standing on y = 0.
const GEO = {
  leg: new THREE.BoxGeometry(0.13, 0.42, 0.13).translate(0, -0.21, 0),
  boot: new THREE.BoxGeometry(0.2, 0.08, 0.14).translate(0.03, -0.4, 0),
  arm: new THREE.BoxGeometry(0.1, 0.34, 0.1).translate(0, -0.17, 0),
  hand: new THREE.SphereGeometry(0.055, 8, 6).translate(0, -0.35, 0),
  torso: new THREE.CapsuleGeometry(0.15, 0.2, 4, 12),
  head: new THREE.SphereGeometry(0.13, 18, 14),
  helmet: new THREE.SphereGeometry(0.15, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  brim: new THREE.CylinderGeometry(0.17, 0.17, 0.02, 18),
  rifle: new THREE.BoxGeometry(0.62, 0.07, 0.07),
  stock: new THREE.BoxGeometry(0.16, 0.1, 0.07),
  blade: new THREE.BoxGeometry(0.66, 0.025, 0.055),
  hilt: new THREE.BoxGeometry(0.16, 0.04, 0.04),
  band: new THREE.TorusGeometry(0.133, 0.024, 6, 24),
  tail: new THREE.BoxGeometry(0.3, 0.02, 0.05).translate(-0.15, 0, 0),
  eyes: new THREE.BoxGeometry(0.03, 0.03, 0.15),
  gem: new THREE.OctahedronGeometry(0.13),
  bullet: new THREE.BoxGeometry(0.32, 0.035, 0.035),
  splat: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  marker: new THREE.RingGeometry(0.28, 0.36, 32).rotateX(-Math.PI / 2),
  shadow: new THREE.CircleGeometry(0.32, 20).rotateX(-Math.PI / 2),
};

const std = (color: number, roughness = 0.75, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const MAT = {
  guardBody: std(0x5b7434),
  guardLegs: std(0x2f3a22),
  skin: std(0xe2b48d, 0.6),
  helmet: std(0x3c4b27, 0.5),
  metal: std(0x1d1e22, 0.4, 0.6),
  ninjaBody: std(0x22252e, 0.8),
  ninjaLegs: std(0x16181e, 0.85),
  ninjaHead: std(0x15161b, 0.7),
  red: std(0xd42a3c, 0.6),
  blade: std(0xe6ecf5, 0.2, 0.9),
  eyes: new THREE.MeshBasicMaterial({ color: 0xfff3d6 }),
  hurt: new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0x991111, roughness: 0.6 }),
  gem: new THREE.MeshStandardMaterial({ color: 0x43e3ff, emissive: 0x1aa6cc, emissiveIntensity: 1.4, roughness: 0.15, metalness: 0.3 }),
  bullet: new THREE.MeshBasicMaterial({ color: 0xfff0a0 }),
  marker: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }),
  blobShadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  slash: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
};

const coneMat = (color: number, opacity: number) =>
  new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const CONE = { patrol: coneMat(0xffe2a0, 0.8), search: coneMat(0xffa040, 0.8), alert: coneMat(0xff3a2e, 0.85) };

let splatTexture: THREE.Texture | null = null;
function getSplatTexture(): THREE.Texture {
  if (splatTexture) return splatTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const rnd = mulberry32(7);
  x.fillStyle = "rgba(140,10,22,0.9)";
  x.beginPath();
  x.arc(64, 64, 30, 0, Math.PI * 2);
  x.fill();
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 26 + rnd() * 30;
    x.beginPath();
    x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + rnd() * 7, 0, Math.PI * 2);
    x.fill();
  }
  splatTexture = new THREE.CanvasTexture(c);
  splatTexture.colorSpace = THREE.SRGBColorSpace;
  return splatTexture;
}
const splatMat = () => new THREE.MeshBasicMaterial({ map: getSplatTexture(), transparent: true, depthWrite: false });

interface Person {
  root: THREE.Group;
  pivot: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  body: THREE.Mesh;
  tails: THREE.Mesh[];
  blade: THREE.Group | null;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow: boolean): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  return m;
}

function makePerson(kind: "guard" | "ninja", shadows: boolean): Person {
  const guard = kind === "guard";
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  root.add(pivot);
  const legMat = guard ? MAT.guardLegs : MAT.ninjaLegs;

  const leg = (z: number) => {
    const g = new THREE.Group();
    g.position.set(0, 0.42, z);
    g.add(mesh(GEO.leg, legMat, shadows), mesh(GEO.boot, MAT.metal, false));
    pivot.add(g);
    return g;
  };
  const legL = leg(-0.085);
  const legR = leg(0.085);

  const body = mesh(GEO.torso, guard ? MAT.guardBody : MAT.ninjaBody, shadows);
  body.position.y = 0.68;
  body.scale.set(0.85, 1, 1.32);
  pivot.add(body);

  const head = mesh(GEO.head, guard ? MAT.skin : MAT.ninjaHead, shadows);
  head.position.y = 1.03;
  pivot.add(head);

  const arm = (z: number) => {
    const g = new THREE.Group();
    g.position.set(0, 0.86, z);
    g.add(mesh(GEO.arm, guard ? MAT.guardBody : MAT.ninjaBody, shadows), mesh(GEO.hand, guard ? MAT.skin : MAT.ninjaHead, false));
    pivot.add(g);
    return g;
  };
  const armL = arm(-0.22);
  const armR = arm(0.22);
  const tails: THREE.Mesh[] = [];
  let blade: THREE.Group | null = null;

  if (guard) {
    const helmet = mesh(GEO.helmet, MAT.helmet, shadows);
    helmet.position.y = 1.05;
    const brim = mesh(GEO.brim, MAT.helmet, false);
    brim.position.set(0.02, 1.05, 0);
    pivot.add(helmet, brim);
    // Rifle held forward at the hip, both arms reaching for it.
    const rifle = mesh(GEO.rifle, MAT.metal, shadows);
    rifle.position.set(0.36, 0.72, 0.06);
    const stock = mesh(GEO.stock, MAT.metal, false);
    stock.position.set(0.02, 0.7, 0.06);
    pivot.add(rifle, stock);
    armL.rotation.set(0.5, 0, 1.25);
    armR.rotation.set(-0.15, 0, 0.95);
  } else {
    const band = mesh(GEO.band, MAT.red, false);
    band.position.y = 1.05;
    band.rotation.x = Math.PI / 2;
    const eyes = mesh(GEO.eyes, MAT.eyes, false);
    eyes.position.set(0.12, 1.04, 0);
    pivot.add(band, eyes);
    for (const z of [-0.035, 0.035]) {
      const t = mesh(GEO.tail, MAT.red, false);
      t.position.set(-0.13, 1.05, z);
      pivot.add(t);
      tails.push(t);
    }
    blade = new THREE.Group();
    const steel = mesh(GEO.blade, MAT.blade, shadows);
    steel.position.x = 0.4;
    const hilt = mesh(GEO.hilt, MAT.metal, false);
    hilt.position.x = 0.02;
    blade.add(steel, hilt);
    blade.position.set(0, -0.35, 0);
    blade.rotation.z = -0.5;
    armR.add(blade);
  }

  const blob = new THREE.Mesh(GEO.shadow, MAT.blobShadow);
  blob.position.y = 0.012;
  root.add(blob);
  return { root, pivot, legL, legR, armL, armR, body, tails, blade };
}

function animateWalk(p: Person, stride: number, moving: number): void {
  const s = Math.sin(stride * 0.09) * 0.55 * moving;
  p.legL.rotation.z = s;
  p.legR.rotation.z = -s;
  p.pivot.position.y = Math.abs(Math.cos(stride * 0.09)) * 0.035 * moving;
}

interface GuardView {
  person: Person;
  cone: THREE.Mesh;
  lastStride: number;
  moving: number;
}

export class Renderer3D {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.5, 120);
  private sun: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;
  private playerLight: THREE.PointLight;
  private overlay: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  private level = new THREE.Group();
  private dynamic = new THREE.Group();
  private grid: Grid | null = null;
  private guardsRef: Guard[] | null = null;
  private guardViews: GuardView[] = [];
  private player: Person;
  private playerMoving = 0;
  private playerLastStride = 0;
  private gemPool: THREE.Mesh[] = [];
  private bulletPool: THREE.Mesh[] = [];
  private splatCount = 0;
  private slashes = new Map<Effect, THREE.Mesh>();
  private markerMesh: THREE.Mesh;
  private camTarget = new THREE.Vector3();
  private camReady = false;
  private rays = 24;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  marker: { x: number; y: number; t: number } | null = null;
  /** Show the whole map from above instead of following the player (bench mode). */
  fitWholeMap = false;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "stage";
    host.appendChild(this.renderer.domElement);

    this.overlay = document.createElement("canvas");
    this.overlay.className = "stage overlay";
    host.appendChild(this.overlay);
    this.octx = this.overlay.getContext("2d")!;

    this.scene.add(new THREE.HemisphereLight(0x8d9cc0, 0x121319, 0.7));
    // Soft shadowless fill from the camera side so faces turned toward the player aren't pitch black.
    this.fill = new THREE.DirectionalLight(0x9fb0d8, 0.55);
    this.scene.add(this.fill, this.fill.target);
    // Low moonlight from the far side, so the wall faces toward the camera sit in shade.
    this.sun = new THREE.DirectionalLight(0xdfe6ff, 1.5);
    this.sun.castShadow = true;
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
    this.sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -11;
    sc.right = 11;
    sc.top = 14;
    sc.bottom = -14;
    sc.near = 1;
    sc.far = 40;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.playerLight = new THREE.PointLight(0xb4ccff, 4, 4.5, 1.4);
    this.scene.add(this.playerLight);

    this.player = makePerson("ninja", true);
    this.markerMesh = new THREE.Mesh(GEO.marker, MAT.marker);
    this.markerMesh.visible = false;
    this.scene.add(this.level, this.dynamic, this.player.root, this.markerMesh);
  }

  resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    const dpr = this.renderer.getPixelRatio();
    this.overlay.width = Math.round(w * dpr);
    this.overlay.height = Math.round(h * dpr);
  }

  /** Screen point -> game world (pixels) on the floor plane. */
  toWorld(clientX: number, clientY: number): Vec | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.ground, hit)) return null;
    return { x: hit.x / S, y: hit.z / S };
  }

  private buildLevel(game: Game): void {
    disposeTree(this.level);
    this.level.clear();
    const g = game.grid;
    const t = THEMES[(game.opts.level - 1) % THEMES.length];
    this.scene.background = new THREE.Color(t.bg);
    this.scene.fog = new THREE.Fog(t.bg, 22, 46);

    // Floor: a 2x2 tile texture repeated across the map.
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!;
    x.fillStyle = t.grout;
    x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 4; i++) {
      const tx = (i % 2) * 64;
      const ty = Math.floor(i / 2) * 64;
      x.fillStyle = (i === 0 || i === 3) ? t.floorA : t.floorB;
      x.fillRect(tx + 2, ty + 2, 60, 60);
      x.fillStyle = "rgba(255,255,255,0.035)";
      x.fillRect(tx + 2, ty + 2, 60, 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(g.w / 2, g.h / 2);
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(g.w, g.h).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }),
    );
    floor.position.set(g.w / 2, 0, g.h / 2);
    floor.receiveShadow = true;
    this.level.add(floor);

    // Walls: one instanced box per wall tile, lighter on top.
    let n = 0;
    for (let i = 0; i < g.cells.length; i++) if (g.cells[i]) n++;
    const side = new THREE.MeshStandardMaterial({ color: t.wall, roughness: 0.85 });
    const top = new THREE.MeshStandardMaterial({ color: t.wallTop, roughness: 0.7, emissive: t.wallTop, emissiveIntensity: 0.18 });
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, WALL_H, 1), [side, side, top, side, side, side], n);
    const m = new THREE.Matrix4();
    let k = 0;
    for (let ty = 0; ty < g.h; ty++) {
      for (let tx = 0; tx < g.w; tx++) {
        if (!g.isWall(tx, ty)) continue;
        m.makeTranslation(tx + 0.5, WALL_H / 2, ty + 0.5);
        walls.setMatrixAt(k++, m);
      }
    }
    walls.castShadow = true;
    walls.receiveShadow = true;
    this.level.add(walls);

    this.grid = g;
    this.splatCount = 0;
    this.camReady = false;
  }

  private buildGuards(game: Game, rays: number): void {
    for (const v of this.guardViews) {
      this.dynamic.remove(v.person.root, v.cone);
      v.cone.geometry.dispose();
    }
    this.guardViews = [];
    this.rays = rays;
    // Shadows for every guard get expensive with big crowds.
    const shadows = game.guards.length <= 40;
    for (const g of game.guards) {
      const person = makePerson("guard", shadows);
      const geo = new THREE.BufferGeometry();
      const verts = rays + 2;
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
      const col = new Float32Array(verts * 3);
      col.fill(0.22);
      col[0] = col[1] = col[2] = 1;
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const idx: number[] = [];
      for (let i = 1; i <= rays; i++) idx.push(0, i + 1, i);
      geo.setIndex(idx);
      const cone = new THREE.Mesh(geo, CONE.patrol);
      cone.frustumCulled = false;
      cone.renderOrder = 1;
      this.dynamic.add(person.root, cone);
      this.guardViews.push({ person, cone, lastStride: g.stride, moving: 0 });
    }
    this.guardsRef = game.guards;
  }

  render(game: Game, rays: number, dt: number): void {
    if (this.grid !== game.grid) this.buildLevel(game);
    if (this.guardsRef !== game.guards || this.rays !== rays) this.buildGuards(game, rays);

    // Guards and their flashlight cones.
    for (let i = 0; i < game.guards.length; i++) {
      const g = game.guards[i];
      const v = this.guardViews[i];
      const p = v.person;
      p.root.position.set(g.x * S, 0, g.y * S);
      p.root.rotation.y = -g.angle;
      if (g.state === "dead") {
        v.cone.visible = false;
        const k = Math.min(1, g.deadT / 0.3);
        p.pivot.rotation.x = (k * Math.PI) / 2;
        p.pivot.position.y = 0.05;
        animateWalk(p, 0, 0);
        continue;
      }
      p.pivot.rotation.x = 0;
      const moved = Math.abs(g.stride - v.lastStride) > 0.01;
      v.lastStride = g.stride;
      v.moving += ((moved ? 1 : 0) - v.moving) * Math.min(1, dt * 10);
      animateWalk(p, g.stride, v.moving);

      v.cone.visible = true;
      v.cone.material = g.state === "alert" ? CONE.alert : g.state === "search" ? CONE.search : CONE.patrol;
      const pts = game.visionPolygon(g, rays);
      const pos = v.cone.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let j = 0, q = 0; j < pts.length; j += 2, q += 3) {
        arr[q] = pts[j] * S;
        arr[q + 1] = 0.03;
        arr[q + 2] = pts[j + 1] * S;
      }
      pos.needsUpdate = true;
    }

    // Player.
    const pl = game.player;
    const pp = this.player;
    pp.root.position.set(pl.x * S, 0, pl.y * S);
    pp.root.rotation.y = -pl.angle;
    const moved = Math.abs(pl.stride - this.playerLastStride) > 0.01;
    this.playerLastStride = pl.stride;
    this.playerMoving += ((moved ? 1 : 0) - this.playerMoving) * Math.min(1, dt * 12);
    animateWalk(pp, pl.stride, this.playerMoving);
    const swing = Math.sin(pl.stride * 0.09) * 0.5 * this.playerMoving;
    pp.armL.rotation.z = -swing;
    pp.armR.rotation.z = pl.lungeT > 0 ? 1.5 : swing + 0.25;
    for (let i = 0; i < pp.tails.length; i++) pp.tails[i].rotation.y = Math.sin(game.time * 12 + i) * 0.35 + (i ? 0.25 : -0.25);
    pp.body.material = pl.hurtT > 0 ? MAT.hurt : MAT.ninjaBody;
    pp.root.visible = game.outcome !== "lost" || Math.floor(game.time * 8) % 2 === 0;
    this.playerLight.position.set(pl.x * S, 1.8, pl.y * S);

    // Gems and bullets from small pools.
    syncPool(this.gemPool, game.gems.length, () => new THREE.Mesh(GEO.gem, MAT.gem), this.dynamic);
    game.gems.forEach((gem, i) => {
      const m = this.gemPool[i];
      const hop = gem.t < 0.5 ? Math.sin((gem.t / 0.5) * Math.PI) * 0.6 : 0.2;
      m.position.set(gem.x * S, 0.3 + hop, gem.y * S);
      m.rotation.y = gem.t * 5;
    });
    syncPool(this.bulletPool, game.bullets.length, () => new THREE.Mesh(GEO.bullet, MAT.bullet), this.dynamic);
    game.bullets.forEach((b, i) => {
      const m = this.bulletPool[i];
      m.position.set(b.x * S, 0.74, b.y * S);
      m.rotation.y = -Math.atan2(b.vy, b.vx);
    });

    // Blood splats stay on the floor for the rest of the level.
    while (this.splatCount < game.splats.length) {
      const s = game.splats[this.splatCount++];
      const m = new THREE.Mesh(GEO.splat, splatMat());
      const size = (s.r / TILE) * 2.6;
      m.scale.set(size, 1, size);
      m.rotation.y = (s.seed % 628) / 100;
      m.position.set(s.x * S, 0.015 + this.splatCount * 0.0005, s.y * S);
      this.level.add(m);
    }

    // Slash arcs.
    for (const [e, m] of this.slashes) {
      if (!game.effects.includes(e)) {
        this.dynamic.remove(m);
        m.geometry.dispose();
        this.slashes.delete(e);
      }
    }
    for (const e of game.effects) {
      if (e.kind !== "slash") continue;
      let m = this.slashes.get(e);
      if (!m) {
        m = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 24, 1, -1.3, 2.6).rotateX(-Math.PI / 2), MAT.slash.clone());
        m.position.set(e.x * S, 0.65, e.y * S);
        m.rotation.y = -e.angle;
        this.dynamic.add(m);
        this.slashes.set(e, m);
      }
      const k = e.t / 0.25;
      (m.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      m.scale.setScalar(1 + k * 0.5);
    }

    if (this.marker) {
      const k = Math.min(1, this.marker.t / 0.45);
      this.markerMesh.visible = true;
      this.markerMesh.position.set(this.marker.x * S, 0.04, this.marker.y * S);
      this.markerMesh.scale.setScalar(0.6 + k * 1.2);
      MAT.marker.opacity = 0.9 * (1 - k);
    } else {
      this.markerMesh.visible = false;
    }

    this.updateCamera(game, dt);
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay(game);
  }

  private updateCamera(game: Game, dt: number): void {
    const g = game.grid;
    const pl = game.player;
    if (this.fitWholeMap) {
      const fov = (this.camera.fov * Math.PI) / 180;
      const dist = Math.max(g.h / (2 * Math.tan(fov / 2)), g.w / (2 * Math.tan(fov / 2) * this.camera.aspect)) * 1.05;
      this.camera.position.set(g.w / 2, dist, g.h / 2 + dist * 0.12);
      this.camera.lookAt(g.w / 2, 0, g.h / 2);
      this.sun.position.set(g.w / 2 - 6, 20, g.h / 2 - 8);
      this.sun.target.position.set(g.w / 2, 0, g.h / 2);
      this.sun.castShadow = false;
      return;
    }
    const target = new THREE.Vector3(pl.x * S, 0, pl.y * S);
    if (!this.camReady) {
      this.camTarget.copy(target);
      this.camReady = true;
    }
    this.camTarget.lerp(target, Math.min(1, dt * 6));
    // Stop at the map edges so the screen never shows the void past the outer wall.
    this.camTarget.x = Math.max(Math.min(4.6, g.w / 2), Math.min(g.w - Math.min(4.6, g.w / 2), this.camTarget.x));
    this.camTarget.z = Math.max(6, Math.min(g.h - 5.2, this.camTarget.z));
    const sh = game.shake * 0.012;
    const cx = this.camTarget.x + (Math.random() - 0.5) * sh;
    const cz = this.camTarget.z + (Math.random() - 0.5) * sh;
    this.camera.position.set(cx, 17, cz + 8.5);
    this.camera.lookAt(cx, 0, cz - 0.8);
    this.sun.position.set(cx - 5, 15, cz - 9);
    this.sun.target.position.set(cx, 0, cz - 1);
    this.fill.position.set(cx + 3, 8, cz + 12);
    this.fill.target.position.set(cx, 0, cz);
  }

  private project(x: number, h: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, h, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.overlay.width, y: ((1 - v.y) / 2) * this.overlay.height };
  }

  private drawOverlay(game: Game): void {
    const ctx = this.octx;
    const dpr = this.renderer.getPixelRatio();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const toCss = (p: { x: number; y: number }) => ({ x: p.x / dpr, y: p.y / dpr });
    const W = this.overlay.width / dpr;
    const H = this.overlay.height / dpr;

    for (const g of game.guards) {
      if (g.state !== "alert" && g.state !== "search") continue;
      const p = toCss(this.project(g.x * S, 1.55, g.y * S));
      if (p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > H + 20) continue;
      const alert = g.state === "alert";
      ctx.fillStyle = alert ? "#ff3b3b" : "#ff9f2e";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "900 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(alert ? "!" : "?", p.x, p.y + 0.5);
    }

    const pl = game.player;
    const hp = toCss(this.project(pl.x * S, 1.6, pl.y * S));
    const w = 34;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(hp.x - w / 2 - 1, hp.y - 1, w + 2, 7);
    ctx.fillStyle = pl.hp > 50 ? "#4ade80" : pl.hp > 25 ? "#facc15" : "#ef4444";
    ctx.fillRect(hp.x - w / 2, hp.y, (w * pl.hp) / 100, 5);

    for (const e of game.effects) {
      if (e.kind !== "text") continue;
      const k = e.t / 0.9;
      const p = toCss(this.project(e.x * S, 1.3 + k * 0.8, e.y * S));
      ctx.globalAlpha = 1 - k * k;
      ctx.font = "900 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.strokeText(`${e.text} ◆`, p.x, p.y);
      ctx.fillStyle = "#43e3ff";
      ctx.fillText(`${e.text} ◆`, p.x, p.y);
      ctx.globalAlpha = 1;
    }
  }
}

function syncPool(pool: THREE.Mesh[], n: number, make: () => THREE.Mesh, parent: THREE.Object3D): void {
  while (pool.length < n) {
    const m = make();
    parent.add(m);
    pool.push(m);
  }
  for (let i = 0; i < pool.length; i++) pool[i].visible = i < n;
}

function disposeTree(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.geometry !== GEO.splat) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const map = (mat as THREE.MeshStandardMaterial).map;
      if (map && map !== splatTexture) map.dispose();
      mat.dispose();
    }
  });
}
