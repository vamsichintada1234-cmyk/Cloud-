// Render an edit plan to MP4 with a single ffmpeg filter graph.
const { ffmpegWithProgress } = require("./ff");

const even = (x) => Math.max(2, Math.round(x / 2) * 2);
const f3 = (x) => (+x).toFixed(3);

// Geometry shared with the browser preview (public/app.js `placeVideo`): the clip is scaled to cover the
// frame, multiplied by zoom, centred, then offset by x/y (fractions of the output size).
function placement(seg, src, W, H) {
  const s = Math.max(W / src.width, H / src.height) * (seg.zoom || 1);
  const vw = even(src.width * s), vh = even(src.height * s);
  return { vw, vh, x: Math.round((W - vw) / 2 + (seg.x || 0) * W), y: Math.round((H - vh) / 2 + (seg.y || 0) * H) };
}

// Transition length actually usable between two shots.
function transitionDur(seg, next) {
  const t = seg.transition;
  if (!next || !t || t.type === "cut" || !(t.duration > 0)) return 0;
  return Math.min(t.duration, next.duration * 0.9, 3);
}

function timeline(plan) {
  let t = 0;
  return plan.segments.map((s) => { const start = t; t += s.duration; return start; });
}

function buildArgs(plan, { clipFiles, clipInfos, refFile, out, draft }) {
  const segs = plan.segments;
  const scale = draft ? 0.5 : 1;
  const W = even(plan.width * scale), H = even(plan.height * scale), FPS = plan.fps;
  const total = segs.reduce((t, s) => t + s.duration, 0);
  const starts = timeline(plan);
  const args = ["-y"], fc = [];

  segs.forEach((s, i) => {
    const d = transitionDur(s, segs[i + 1]);
    const L = s.duration + d;
    s._L = L; s._d = d;
    const speed = s.speed || 1;
    args.push("-ss", f3(Math.max(0, s.in)), "-t", f3(L * speed + 0.2), "-i", clipFiles[s.clip]);
  });
  const refIdx = segs.length;
  if (plan.refAudio && refFile) args.push("-i", refFile);

  segs.forEach((s, i) => {
    const src = clipInfos[s.clip];
    const p = placement(s, src, W, H);
    const g = s.grade || {};
    const chain = [
      `setpts=(PTS-STARTPTS)/${f3(s.speed || 1)}`,
      `fps=${FPS}`,
      `scale=${p.vw}:${p.vh}:flags=bicubic`,
      s.flip ? "hflip" : null,
      `eq=brightness=${f3(g.brightness ?? 0)}:contrast=${f3(g.contrast ?? 1)}:saturation=${f3(g.saturation ?? 1)}`,
      g.r != null && (g.r !== 1 || g.g !== 1 || g.b !== 1) ? `colorchannelmixer=rr=${f3(g.r)}:gg=${f3(g.g)}:bb=${f3(g.b)}` : null,
      "format=yuv420p",
    ].filter(Boolean).join(",");
    fc.push(`[${i}:v:0]${chain}[fg${i}]`);
    fc.push(`color=c=black:s=${W}x${H}:r=${FPS}:d=${f3(s._L)},format=yuv420p[bg${i}]`);
    fc.push(`[bg${i}][fg${i}]overlay=x=${p.x}:y=${p.y}:eof_action=repeat,trim=duration=${f3(s._L)},setpts=PTS-STARTPTS,settb=AVTB,setsar=1[v${i}]`);
  });

  // join shots: hard cuts concatenate, transitions cross-fade into the next shot's first frames
  let cur = "v0", curLen = segs[0]._L;
  for (let i = 1; i < segs.length; i++) {
    const prev = segs[i - 1], lab = `j${i}`;
    if (prev._d > 0) {
      fc.push(`[${cur}][v${i}]xfade=transition=${prev.transition.type}:duration=${f3(prev._d)}:offset=${f3(curLen - prev._d)}[${lab}]`);
      curLen += segs[i]._L - prev._d;
    } else {
      fc.push(`[${cur}][v${i}]concat=n=2:v=1:a=0[${lab}]`);
      curLen += segs[i]._L;
    }
    cur = lab;
  }
  const fades = [];
  if (plan.fadeIn > 0) fades.push(`fade=t=in:d=${f3(plan.fadeIn)}`);
  if (plan.fadeOut > 0) fades.push(`fade=t=out:st=${f3(Math.max(0, total - plan.fadeOut))}:d=${f3(plan.fadeOut)}`);
  fc.push(`[${cur}]${[...fades, "format=yuv420p"].join(",")}[vout]`);

  // audio: the reference soundtrack (music, SFX, everything) plus optional original clip sound
  const mix = [];
  if (plan.refAudio && refFile) {
    fc.push(`[${refIdx}:a:0]atrim=0:${f3(total)},asetpts=PTS-STARTPTS,volume=${f3(plan.refVolume ?? 1)},aresample=48000[ra]`);
    mix.push("[ra]");
  }
  segs.forEach((s, i) => {
    if (!(s.clipVolume > 0) || !clipInfos[s.clip].hasAudio) return;
    let sp = s.speed || 1; const tempo = [];
    while (sp < 0.5) { tempo.push("atempo=0.5"); sp /= 0.5; }
    tempo.push(`atempo=${f3(sp)}`);
    fc.push(`[${i}:a:0]asetpts=PTS-STARTPTS,${tempo.join(",")},atrim=0:${f3(s.duration)},volume=${f3(s.clipVolume)},aresample=48000,adelay=${Math.round(starts[i] * 1000)}:all=1[ca${i}]`);
    mix.push(`[ca${i}]`);
  });
  if (!mix.length) fc.push(`anullsrc=r=48000:cl=stereo,atrim=0:${f3(total)}[aout]`);
  else fc.push(`${mix.join("")}amix=inputs=${mix.length}:normalize=0:duration=longest,apad,atrim=0:${f3(total)}[aout]`);

  args.push(
    "-filter_complex", fc.join(";"),
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", draft ? "ultrafast" : "veryfast", "-crf", draft ? "28" : "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", f3(total), out,
  );
  segs.forEach((s) => { delete s._L; delete s._d; });
  return { args, total };
}

async function renderPlan(plan, opts, onProgress) {
  const { args, total } = buildArgs(plan, opts);
  await ffmpegWithProgress(args, total, onProgress);
  return { total };
}

module.exports = { renderPlan, buildArgs, placement };
