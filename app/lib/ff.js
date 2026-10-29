// Thin wrappers around the ffmpeg / ffprobe binaries.
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const FFPROBE = process.env.FFPROBE || "ffprobe";

function run(bin, args, opts = {}) {
  if (process.env.REFCUT_FFMPEG_BRIDGE && bin === FFMPEG) return runBridge(args, opts);
  const { onStdout, onStderr, allowFail = false } = opts;
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out = [], err = [];
    p.stdout.on("data", (b) => (onStdout ? onStdout(b) : out.push(b)));
    p.stderr.on("data", (b) => { err.push(b); if (onStderr) onStderr(b); });
    p.on("error", reject);
    p.on("close", (code) => {
      const stderr = Buffer.concat(err).toString();
      if (code !== 0 && !allowFail) return reject(new Error(`${bin} exited ${code}: ${stderr.slice(-1500)}`));
      resolve({ stdout: Buffer.concat(out), stderr });
    });
  });
}

async function probe(file) {
  if (process.env.REFCUT_NO_FFPROBE) return probeWithFfmpeg(file);
  const { stdout } = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const j = JSON.parse(stdout.toString());
  const v = j.streams.find((s) => s.codec_type === "video");
  const a = j.streams.find((s) => s.codec_type === "audio");
  if (!v) throw new Error("No video stream found in " + file);
  // phone footage often carries a rotation tag; ffmpeg auto-rotates, so swap dims to match
  const rot = Math.abs(Number(v.tags?.rotate || v.side_data_list?.find((d) => d.rotation != null)?.rotation || 0)) % 180;
  const [n, d] = (v.avg_frame_rate && v.avg_frame_rate !== "0/0" ? v.avg_frame_rate : v.r_frame_rate).split("/").map(Number);
  return probeResult(v.width, v.height, rot, d ? n / d : 30, Number(j.format.duration || v.duration || 0), !!a);
}

// The Android app has no ffmpeg program: the app's Java side runs FFmpegKit and exposes it on a local port.
// Protocol: POST /run {args} → text lines "P <ms>" (progress), then "E <escaped log>" and "X <exit code>".
function runBridge(args, { onStdout, onProgressSec, allowFail = false }) {
  args = [...args];
  let outFile = null;
  if (onStdout && args[args.length - 1] === "-") {
    outFile = path.join(os.tmpdir(), `refcut-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.raw`);
    args[args.length - 1] = outFile;
  }
  const drop = (flag, n) => { const i = args.indexOf(flag); if (i >= 0) args.splice(i, n); };
  drop("-progress", 2); drop("-nostats", 1); // progress comes from the bridge's statistics instead
  const [host, port] = process.env.REFCUT_FFMPEG_BRIDGE.split(":");
  return new Promise((resolve, reject) => {
    const done = (err, val) => { if (outFile) fs.rm(outFile, { force: true }, () => {}); err ? reject(err) : resolve(val); };
    const req = http.request({ host, port, method: "POST", path: "/run", headers: { "Content-Type": "application/json", "X-Token": process.env.REFCUT_BRIDGE_TOKEN || "" } }, (res) => {
      let buf = "", log = "", code = null;
      res.setEncoding("utf8");
      res.on("data", (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i), v = line.slice(2);
          buf = buf.slice(i + 1);
          if (line[0] === "P") onProgressSec?.(Number(v) / 1000);
          else if (line[0] === "E") log += v.replace(/\\(n|\\)/g, (_, c) => (c === "n" ? "\n" : "\\"));
          else if (line[0] === "X") code = Number(v);
        }
      });
      res.on("error", (e) => done(e));
      res.on("end", () => {
        if (code !== 0 && !allowFail) return done(new Error(`ffmpeg exited ${code}: ${log.slice(-1500)}`));
        if (!outFile || code !== 0) return done(null, { stdout: Buffer.alloc(0), stderr: log });
        const rs = fs.createReadStream(outFile, { highWaterMark: 1 << 20 });
        rs.on("data", (b) => onStdout(b));
        rs.on("error", (e) => done(e));
        rs.on("end", () => done(null, { stdout: Buffer.alloc(0), stderr: log }));
      });
    });
    req.on("error", (e) => done(e));
    req.end(JSON.stringify({ args }));
  });
}

// Same result from `ffmpeg -i` output, for builds that ship without ffprobe (the Android app).
async function probeWithFfmpeg(file) {
  const { stderr } = await run(FFMPEG, ["-hide_banner", "-loglevel", "info", "-i", file], { allowFail: true });
  const video = /Stream #\S+.*?: Video: (.*)/.exec(stderr);
  if (!video) {
    const why = stderr.trim().split("\n").slice(-3).join(" ").slice(0, 300);
    throw new Error(`No video stream found in ${path.basename(file)}${why ? ` (ffmpeg: ${why})` : " (ffmpeg printed nothing — it may have failed to run)"}`);
  }
  const dims = /, (\d{2,5})x(\d{2,5})[\s,]/.exec(video[1]) || [0, 1920, 1080];
  const fps = Number((/([\d.]+) fps/.exec(video[1]) || /([\d.]+) tbr/.exec(video[1]) || [0, 30])[1]);
  const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr);
  const rot = Math.abs(Number((/rotation of (-?[\d.]+) degrees/.exec(stderr) || [0, 0])[1])) % 180;
  return probeResult(Number(dims[1]), Number(dims[2]), rot, fps, dur ? dur[1] * 3600 + dur[2] * 60 + Number(dur[3]) : 0, /Stream #\S+.*?: Audio:/.test(stderr));
}

function probeResult(w, h, rot, fps, duration, hasAudio) {
  if (rot === 90) [w, h] = [h, w];
  return { width: w, height: h, fps: fps > 0 && fps < 240 ? fps : 30, duration, hasAudio };
}

// Decode a video into tiny RGB frames: returns { frames: Buffer[], fps, w, h }
async function tinyFrames(file, { w = 32, h = 18, fps } = {}) {
  const vf = [fps ? `fps=${fps}` : null, `scale=${w}:${h}:flags=area`, "format=rgb24"].filter(Boolean).join(",");
  const size = w * h * 3;
  const frames = [];
  let pending = Buffer.alloc(0);
  await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-i", file, "-an", "-vf", vf, "-f", "rawvideo", "-"], {
    onStdout(b) {
      pending = pending.length ? Buffer.concat([pending, b]) : b;
      while (pending.length >= size) {
        frames.push(Buffer.from(pending.subarray(0, size)));
        pending = pending.subarray(size);
      }
    },
  });
  return { frames, w, h };
}

// Run ffmpeg reporting progress (0..1) against an expected output duration in seconds.
function ffmpegWithProgress(args, totalSec, onProgress) {
  return run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-progress", "pipe:1", "-nostats", ...args], {
    onProgressSec: (sec) => totalSec > 0 && onProgress?.(Math.min(1, sec / totalSec)),
    onStdout(b) {
      const m = /out_time_us=(\d+)/g; let r, last;
      const s = b.toString();
      while ((r = m.exec(s))) last = r[1];
      if (last && totalSec > 0) onProgress?.(Math.min(1, Number(last) / 1e6 / totalSec));
    },
  });
}

module.exports = { FFMPEG, FFPROBE, run, probe, tinyFrames, ffmpegWithProgress };
