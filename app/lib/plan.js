// Turn a reference analysis + clip analyses into an editable edit plan (EDL).
const { meanStats, avg } = require("./analyze");

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const r3 = (x) => +x.toFixed(3);

// Colour grade that moves a clip's look toward the reference shot's look.
function matchGrade(ref, clip, strength = 0.8) {
  const k = strength;
  const contrast = clamp(1 + ((ref.std / Math.max(4, clip.std)) - 1) * k, 0.7, 1.4);
  const refL = ref.luma / 255, clipL = clip.luma / 255;
  const brightness = clamp((refL - 0.5 - (clipL - 0.5) * contrast) * k, -0.25, 0.25);
  const saturation = clamp(1 + ((ref.sat / Math.max(0.02, clip.sat)) - 1) * k, 0.4, 1.8);
  const ch = (c) => clamp(1 + (((ref[c] + 1) / (ref.luma + 1)) / ((clip[c] + 1) / (clip.luma + 1)) - 1) * k, 0.85, 1.15);
  return { brightness: r3(brightness), contrast: r3(contrast), saturation: r3(saturation), r: r3(ch("r")), g: r3(ch("g")), b: r3(ch("b")) };
}

// Score every window of `len` seconds in a clip; prefer detailed, well-exposed, cut-free footage whose
// motion resembles the reference shot.
function bestWindow(clip, len, lo, hi, refMotion) {
  const fps = clip.fps, n = clip.stats.length;
  const w = Math.max(1, Math.round(len * fps));
  const a0 = clamp(Math.floor(lo * fps), 0, Math.max(0, n - w));
  const a1 = clamp(Math.floor(hi * fps) - w, a0, Math.max(0, n - w));
  const step = Math.max(1, Math.round(fps / 5));
  let best = a0, bestScore = -Infinity;
  for (let a = a0; a <= a1; a += step) {
    const st = clip.stats.slice(a, a + w), mo = clip.motion.slice(a + 1, a + w);
    const det = avg(clip.detail.slice(a, a + w));
    const dark = st.filter((s) => s.luma < 22 || s.luma > 240).length / st.length;
    const internalCut = mo.some((m) => m > 40) ? 1 : 0;
    // tiny frames at 10fps exaggerate motion vs the native-rate reference; compare on a log scale
    const motionMatch = -Math.abs(Math.log((avg(mo) + 1) / (refMotion * (10 / 30) * 3 + 1)));
    // gentle preference for the middle of the clip (operators settle after starting a take)
    const centre = 1 - Math.abs((a + w / 2) / Math.max(1, n) - 0.5);
    const score = det * 0.6 - dark * 40 - internalCut * 12 + motionMatch * 4 + centre * 2;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return best / fps;
}

function buildPlan(ref, clips, opts = {}) {
  const strength = opts.gradeStrength ?? 0.8;
  const N = clips.length;
  // every clip must appear: split the longest reference shots (with hard cuts) until there are ≥ N shots
  const shots = ref.segments.map((s) => ({ ...s }));
  while (shots.length < N) {
    let i = 0; shots.forEach((s, k) => { if (s.duration > shots[i].duration) i = k; });
    const s = shots[i], half = s.duration / 2;
    shots.splice(i, 1, { ...s, duration: half, transitionOut: { type: "cut", duration: 0 }, addedCut: true }, { ...s, start: s.start + half, duration: s.duration - half });
  }
  const M = shots.length;
  // keep the user's order: box 1 fills the first shots, box 2 the next, ...
  const owner = shots.map((_, k) => Math.min(N - 1, Math.floor((k * N) / M)));

  const segments = [];
  for (let c = 0; c < N; c++) {
    const mine = shots.map((s, k) => ({ s, k })).filter((x) => owner[x.k] === c);
    const clip = clips[c];
    const D = clip.duration;
    const need = mine.reduce((t, x) => t + x.s.duration + (x.s.transitionOut?.duration || 0), 0);
    let cursor = 0;
    mine.forEach(({ s, k }, j) => {
      const len = s.duration + (s.transitionOut?.duration || 0);
      let speed = 1, inPoint = 0;
      if (len > D) {
        speed = clamp(D / len, 0.5, 1); // too short: slow it down (and freeze the last frame if still short)
      } else {
        // chronological zones inside the clip, one per shot that uses it
        // chronological zones inside the clip, one per shot that uses it; when the shots need more
        // footage than the clip has, windows may overlap and any part of the clip is allowed
        const fits = need <= D, zone = D / mine.length;
        const lo = fits ? Math.max(cursor, j * zone - len * 0.25) : 0;
        const hi = fits ? Math.min(D, Math.max(lo + len, (j + 1) * zone + len * 0.25)) : D;
        inPoint = bestWindow(clip, len, lo, hi, s.motion);
        if (fits) cursor = Math.min(D - 0.01, inPoint + len);
      }
      const a = Math.floor(inPoint * clip.fps), b = Math.ceil((inPoint + len * speed) * clip.fps);
      const clipLook = meanStats(clip.stats.slice(a, Math.max(a + 1, b)));
      const grade = matchGrade(s.look, clipLook, strength);
      segments.push({
        id: "s" + k,
        clip: c,
        in: r3(inPoint),
        duration: r3(s.duration),
        speed: r3(speed),
        zoom: 1,
        x: 0, y: 0,
        flip: false,
        grade, autoGrade: { ...grade },
        transition: s.transitionOut ? { ...s.transitionOut } : { type: "cut", duration: 0 },
        clipVolume: 0,
        refStart: r3(s.start),
      });
    });
  }
  segments.sort((p, q) => p.refStart - q.refStart);
  segments.forEach((s, i) => (s.id = "s" + i));
  segments[segments.length - 1].transition = { type: "cut", duration: 0 };

  const W = even(ref.info.width), H = even(ref.info.height);
  return {
    version: 1,
    width: W, height: H,
    fps: +Math.min(60, ref.info.fps).toFixed(3),
    fadeIn: ref.fadeIn, fadeOut: ref.fadeOut,
    refAudio: ref.info.hasAudio, refVolume: 1,
    gradeStrength: strength,
    refCuts: shots.map((s) => r3(s.start)).concat(r3(ref.duration)), // reference rhythm, for snapping in the editor
    segments,
  };
}

const even = (x) => Math.max(2, Math.round(x / 2) * 2);

module.exports = { buildPlan, matchGrade };
