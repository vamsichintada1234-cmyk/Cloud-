/* Deterministic animation engine: every animated value is a pure function of time, sampled at 240 Hz
   and written into the paused GSAP timeline as tl.set() keys (seek-safe, no callbacks). */
window.HF = (function () {
  const E = {
    linear: p => p,
    "sine.inOut": p => -(Math.cos(Math.PI * p) - 1) / 2,
    "power2.in": p => p * p, "power2.out": p => 1 - (1 - p) ** 2,
    "power2.inOut": p => p < .5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2,
    "power3.in": p => p ** 3, "power3.out": p => 1 - (1 - p) ** 3,
    "power3.inOut": p => p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2,
    "back.out": p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2; },
  };
  // keys: [[t, value, easeIntoThisKey], ...]  -> value at time t (numbers or arrays)
  function track(keys) {
    return t => {
      if (t <= keys[0][0]) return keys[0][1];
      for (let i = 1; i < keys.length; i++) {
        const [t1, v1, e] = keys[i], [t0, v0] = keys[i - 1];
        if (t <= t1) {
          const p = (E[e || "linear"])((t - t0) / (t1 - t0));
          return Array.isArray(v0) ? v0.map((a, k) => a + (v1[k] - a) * p) : v0 + (v1 - v0) * p;
        }
      }
      return keys[keys.length - 1][1];
    };
  }
  // camera state [tx, ty, s] (world -> screen: p*s + t). Helper to aim world point w at screen point a with scale s.
  const aim = (wx, wy, ax, ay, s) => [ax - wx * s, ay - wy * s, s];
  // on-screen speed (px/s) of the world point under screen point (ax, ay)
  function camSpeed(cam, t, ax = 540, ay = 960, dt = 1 / 960) {
    const c0 = cam(t - dt / 2), c1 = cam(t + dt / 2);
    const wx = (ax - c0[0]) / c0[2], wy = (ay - c0[1]) / c0[2];
    const x1 = wx * c1[2] + c1[0], y1 = wy * c1[2] + c1[1];
    return Math.hypot(x1 - ax, y1 - ay) / dt;
  }
  const sigmaFor = v => Math.min(40, 0.29 * v * 0.75 / 60);   // motion-blur sigma (px) from speed (px/s)
  // Bake: fn(t) -> {selector: {prop: value}} ; written as tl.set at every 1/240 s.
  function bake(tl, duration, fn, rate = 240) {
    const n = Math.round(duration * rate);
    let last = {};
    for (let i = 0; i <= n; i++) {
      const t = i / rate, st = fn(t);
      for (const sel in st) {
        const key = sel + JSON.stringify(st[sel]);
        if (last[sel] === key) continue;
        last[sel] = key; tl.set(sel, st[sel], t);
      }
    }
    return tl;
  }
  const blurCss = s => s > 0.05 ? `blur(${s.toFixed(2)}px)` : "none";
  return { E, track, aim, camSpeed, sigmaFor, bake, blurCss };
})();
