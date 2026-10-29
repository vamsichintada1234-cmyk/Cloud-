// Reference + clip analysis on tiny decoded frames: cut/transition detection, look (colour) stats, motion.
const { probe, tinyFrames } = require("./ff");

function frameStats(f) {
  let r = 0, g = 0, b = 0, l = 0, l2 = 0, sat = 0;
  const n = f.length / 3;
  for (let i = 0; i < f.length; i += 3) {
    const R = f[i], G = f[i + 1], B = f[i + 2];
    const L = 0.299 * R + 0.587 * G + 0.114 * B;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    r += R; g += G; b += B; l += L; l2 += L * L; sat += mx ? (mx - mn) / mx : 0;
  }
  const mean = l / n;
  return { r: r / n, g: g / n, b: b / n, luma: mean, std: Math.sqrt(Math.max(0, l2 / n - mean * mean)), sat: sat / n };
}

function diff(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

// how well `mid` is explained as a blend of a and b (low = looks like a dissolve frame)
function blendError(a, mid, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(mid[i] - (a[i] + b[i]) / 2);
  return s / a.length;
}

// detail measure: mean horizontal+vertical gradient of luma
function detail(f, w, h) {
  const L = (x, y) => { const i = (y * w + x) * 3; return 0.299 * f[i] + 0.587 * f[i + 1] + 0.114 * f[i + 2]; };
  let s = 0;
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) s += Math.abs(L(x + 1, y) - L(x, y)) + Math.abs(L(x, y + 1) - L(x, y));
  return s / ((w - 1) * (h - 1));
}

const median = (arr) => { const a = [...arr].sort((x, y) => x - y); return a.length ? a[a.length >> 1] : 0; };
const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);

function meanStats(stats) {
  const keys = ["r", "g", "b", "luma", "std", "sat"];
  const o = {};
  for (const k of keys) o[k] = avg(stats.map((s) => s[k]));
  return o;
}

async function analyzeReference(file) {
  const info = await probe(file);
  const fps = Math.min(60, info.fps);
  const { frames } = await tinyFrames(file, { fps: info.fps > 60 ? 30 : undefined });
  const n = frames.length;
  const dt = 1 / fps;
  const stats = frames.map(frameStats);
  const d = [0];
  for (let i = 1; i < n; i++) d.push(diff(frames[i - 1], frames[i]));
  const used = new Uint8Array(n); // frames already explained by a transition
  const bounds = []; // { frame, type, frames (duration in frames) }

  // 1) fades through black / white (luma dips or flashes in the middle of the video)
  const scanRuns = (pred, type) => {
    let i = 0;
    while (i < n) {
      if (!pred(stats[i])) { i++; continue; }
      let j = i; while (j + 1 < n && pred(stats[j + 1])) j++;
      if (i > 2 && j < n - 3) {
        // widen to cover the ramp down/up
        let a = i, b = j;
        const base = (k) => stats[k].luma;
        while (a > 0 && i - a < fps && Math.abs(base(a - 1) - base(a)) > 2) a--;
        while (b < n - 1 && b - j < fps && Math.abs(base(b + 1) - base(b)) > 2) b++;
        const len = Math.max(2, b - a);
        bounds.push({ frame: Math.round((a + b) / 2) - Math.floor(len / 2), type, frames: len });
        for (let k = a; k <= b; k++) used[k] = 1;
      }
      i = j + 1;
    }
  };
  scanRuns((s) => s.luma < 14, "fadeblack");
  scanRuns((s) => s.luma > 236 && s.std < 12, "fadewhite");

  // 2) hard cuts: single-frame spikes well above the local level
  const win = Math.max(3, Math.round(fps / 5));
  for (let i = 1; i < n; i++) {
    if (used[i]) continue;
    const local = [];
    for (let k = Math.max(1, i - win); k <= Math.min(n - 1, i + win); k++) if (k !== i) local.push(d[k]);
    const m = median(local);
    if (d[i] > 16 && d[i] > 3 * m + 4) {
      // flash frame (one very bright frame) → white flash transition
      const flash = stats[i].luma > 200 && i + 1 < n && stats[i].luma - stats[i + 1].luma > 60;
      bounds.push({ frame: i, type: flash ? "fadewhite" : "cut", frames: flash ? 2 : 0, strength: d[i] });
      used[i] = 1;
    }
  }

  // 3) dissolves: endpoints very different, every step small, middle frame ≈ blend of endpoints
  const maxW = Math.round(fps * 1.2), minW = Math.max(4, Math.round(fps * 0.2));
  for (let w = maxW; w >= minW; w--) {
    for (let a = 1; a + w < n - 1; a++) {
      const b = a + w;
      let clean = true, maxStep = 0;
      for (let k = a; k <= b; k++) { if (used[k]) { clean = false; break; } maxStep = Math.max(maxStep, d[k]); }
      if (!clean) continue;
      const D = diff(frames[a], frames[b]);
      if (D < 30 || maxStep > D * 0.45) continue;
      const mid = frames[(a + b) >> 1];
      if (blendError(frames[a], mid, frames[b]) > D * 0.3) continue;
      // must be calm just outside the window (not a whip pan / moving camera)
      const outside = avg([d[a - 1] || 0, d[b + 1] || 0]);
      if (outside > avg(d.slice(a, b + 1)) * 0.8) continue;
      // tighten to the frames that actually change (static footage on either side is not transition)
      let ta = a, tb = b;
      while (ta < tb - 2 && d[ta + 1] < maxStep * 0.25) ta++;
      while (tb > ta + 2 && d[tb] < maxStep * 0.25) tb--;
      if (tb - ta < minW * 0.75) continue;
      bounds.push({ frame: ta, type: "dissolve", frames: tb - ta });
      for (let k = ta; k <= tb; k++) used[k] = 1;
      a = b;
    }
  }

  bounds.sort((x, y) => x.frame - y.frame);
  // drop boundaries that would create shots shorter than ~0.25s
  const minGap = Math.max(2, Math.round(fps * 0.25));
  const clean = [];
  for (const bd of bounds) {
    const prev = clean[clean.length - 1];
    const prevEnd = prev ? prev.frame + prev.frames : 0;
    if (bd.frame - prevEnd < minGap && bd.frame >= minGap) {
      if (prev && bd.type === "cut" && prev.type === "cut" && (bd.strength || 0) > (prev.strength || 0)) clean[clean.length - 1] = bd;
      continue;
    }
    if (bd.frame < minGap || bd.frame > n - minGap) continue;
    clean.push(bd);
  }

  // 3b) intro fade-in / outro fade-out
  let fadeIn = 0, fadeOut = 0;
  if (n > 4 && stats[0].luma < 20) {
    let k = 0; while (k < n - 1 && stats[k].luma < Math.max(25, stats[Math.min(n - 1, Math.round(fps * 2))].luma * 0.85)) k++;
    fadeIn = Math.min(3, k * dt);
  }
  if (n > 4 && stats[n - 1].luma < 20) {
    let k = n - 1; while (k > 0 && stats[k].luma < Math.max(25, stats[Math.max(0, n - 1 - Math.round(fps * 2))].luma * 0.85)) k--;
    fadeOut = Math.min(3, (n - 1 - k) * dt);
  }

  // 4) shots between boundaries
  const duration = info.duration || n * dt;
  // A shot runs from its first visible frame (start of the incoming transition) to the start of the
  // outgoing one, so durations sum to the video length and transitions overlap the next shot.
  const segments = [];
  let start = 0, skip = 0;
  const pushSeg = (endFrame, next) => {
    const a = start, b = Math.max(a + 1, endFrame);
    const sa = Math.min(b - 1, a + skip); // look/motion measured outside the transition frames
    segments.push({
      start: +(a * dt).toFixed(3),
      duration: +((b - a) * dt).toFixed(3),
      look: meanStats(stats.slice(sa, b)),
      motion: avg(d.slice(sa + 1, b)),
      transitionOut: next ? { type: next.type, duration: next.type === "cut" ? 0 : +(next.frames * dt).toFixed(3) } : null,
    });
  };
  for (const bd of clean) { pushSeg(bd.frame, bd); start = bd.frame; skip = bd.type === "cut" ? 0 : bd.frames; }
  pushSeg(n, null);
  const last = segments[segments.length - 1];
  last.duration = +Math.max(0.1, duration - last.start).toFixed(3);

  return { info: { ...info, fps }, duration, segments, fadeIn: +fadeIn.toFixed(2), fadeOut: +fadeOut.toFixed(2), look: meanStats(stats) };
}

// Clip analysis at 10 fps: per-frame look, motion, detail and internal cuts.
async function analyzeClip(file) {
  const info = await probe(file);
  const fps = 10;
  const { frames, w, h } = await tinyFrames(file, { fps });
  const stats = frames.map(frameStats);
  const motion = [0], det = frames.map((f) => detail(f, w, h));
  for (let i = 1; i < frames.length; i++) motion.push(diff(frames[i - 1], frames[i]));
  return { info, fps, stats, motion, detail: det, duration: info.duration || frames.length / fps };
}

module.exports = { analyzeReference, analyzeClip, meanStats, avg };
