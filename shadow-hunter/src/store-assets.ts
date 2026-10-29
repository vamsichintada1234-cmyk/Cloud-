/**
 * Google Play listing art, rendered from the game's own models.
 * Dev-only: open /store-assets.html on the dev server (it is not part of the app build).
 * scripts/store-assets.cjs drives this page and saves the PNGs into store/.
 */
import * as THREE from "three";
import { Game } from "./game";
import { DEFAULT_HERO } from "./heroes";
import { Renderer3D } from "./render3d";

/** 512x512 app icon: the ninja's masked head with a katana behind it, caught in a guard's flashlight. */
function icon(): string {
  const S = 512;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(S, S, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0x8fa2d8, 0x0c0d12, 1.2));
  const key = new THREE.DirectionalLight(0xffe7b8, 3.2);
  key.position.set(3, 3, 4);
  const redRim = new THREE.DirectionalLight(0xff2a40, 6);
  redRim.position.set(-4, 1, -2);
  const blueRim = new THREE.DirectionalLight(0x6f95ff, 3);
  blueRim.position.set(-2, 3, 3);
  scene.add(key, redRim, blueRim);

  const std = (color: number, roughness: number, metalness = 0, emissive = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive });
  const look = DEFAULT_HERO.look;

  // Katana behind the head, on a diagonal.
  const sword = new THREE.Group();
  // Not fully metallic: there is no environment for chrome to reflect, so it would render black.
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 2.6, 0.1), std(look.blade, 0.3, 0.35, 0x4a5466));
  blade.position.y = 0.55;
  const guardPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 24), std(0xc9a23a, 0.35, 0.9));
  guardPlate.position.y = -0.78;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 12), std(0x1a1a1f, 0.6));
  grip.position.y = -1.08;
  sword.add(blade, guardPlate, grip);
  // The camera looks down the x axis, so tilt the sword in the y-z plane to show its flat.
  sword.rotation.x = -0.8;
  sword.position.set(-0.55, 0.05, 0.05);
  scene.add(sword);

  // Head, mask, headband and its two tails.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 48, 36), std(look.head, 0.55));
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.625, 0.085, 16, 64), std(look.band, 0.45));
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.1;
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), std(look.band, 0.45));
  knot.position.set(-0.6, 0.1, -0.18);
  const tail = (y: number, rz: number, ry: number) => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.13, 0.025).translate(-0.37, 0, 0), std(look.band, 0.45));
    t.position.set(-0.62, 0.1, -0.2);
    t.rotation.set(0, ry, rz);
    t.position.y = y;
    return t;
  };
  // Eye slit: two glowing eyes in a dark band of cloth.
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.7), std(0x050507, 0.9));
  slit.position.set(0.6, -0.07, 0);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0 });
  const eye = (z: number) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 10), eyeMat);
    e.scale.set(0.5, 0.75, 1.6);
    e.position.set(0.62, -0.06, z);
    return e;
  };
  const face = new THREE.Group();
  face.add(head, band, knot, tail(0.14, 0.35, 0.5), tail(0.06, -0.15, 0.75), slit, eye(-0.16), eye(0.16));
  face.rotation.y = -0.45;
  scene.add(face);

  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  cam.position.set(4.3, 0.35, 0.2);
  cam.lookAt(0, 0.02, 0);
  r.render(scene, cam);

  const c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d")!;
  const bg = x.createRadialGradient(S * 0.5, S * 0.45, 30, S * 0.5, S * 0.5, S * 0.75);
  bg.addColorStop(0, "#2b3456");
  bg.addColorStop(1, "#06070c");
  x.fillStyle = bg;
  x.fillRect(0, 0, S, S);
  // A guard's flashlight sweeping in from the top right.
  const beam = x.createLinearGradient(S, 0, S * 0.3, S * 0.7);
  beam.addColorStop(0, "rgba(255,226,150,0.5)");
  beam.addColorStop(1, "rgba(255,226,150,0)");
  x.fillStyle = beam;
  x.beginPath();
  x.moveTo(S * 1.05, S * -0.05);
  x.lineTo(S * 0.05, S * 0.55);
  x.lineTo(S * 0.5, S * 1.05);
  x.closePath();
  x.fill();
  x.drawImage(r.domElement, 0, 0);
  r.dispose();
  return c.toDataURL("image/png");
}

/** 1024x500 feature graphic: a real level with the ninja creeping up behind a guard. */
function feature(host: HTMLElement): void {
  const game = new Game({ level: 3, guards: 6, autopilot: false, invulnerable: true, hero: DEFAULT_HERO });
  const pl = game.player;
  // Put the player a step behind the guard nearest the middle of the map.
  const mid = { x: (game.grid.w * 32) / 2, y: (game.grid.h * 32) / 2 };
  const g = game.guards.reduce((a, b) => (Math.hypot(b.x - mid.x, b.y - mid.y) < Math.hypot(a.x - mid.x, a.y - mid.y) ? b : a));
  for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2]) {
    const a = g.angle + Math.PI + turn;
    const x = g.x + Math.cos(a) * 46;
    const y = g.y + Math.sin(a) * 46;
    if (game.grid.circleFree(x, y, 10)) {
      pl.x = x;
      pl.y = y;
      break;
    }
  }
  pl.angle = Math.atan2(g.y - pl.y, g.x - pl.x);
  pl.stride = 30;
  const renderer = new Renderer3D(host);
  renderer.zoom = 0.58;
  renderer.setHero(DEFAULT_HERO);
  renderer.resize();
  for (let i = 0; i < 90; i++) renderer.render(game, 24, 1 / 30);
}

(window as unknown as { storeAssets: object }).storeAssets = { icon, feature };
