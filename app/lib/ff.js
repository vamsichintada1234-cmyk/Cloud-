// Thin wrappers around the ffmpeg / ffprobe binaries.
const { spawn } = require("child_process");

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const FFPROBE = process.env.FFPROBE || "ffprobe";

function run(bin, args, { onStdout, onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out = [], err = [];
    p.stdout.on("data", (b) => (onStdout ? onStdout(b) : out.push(b)));
    p.stderr.on("data", (b) => { err.push(b); if (onStderr) onStderr(b); });
    p.on("error", reject);
    p.on("close", (code) => {
      const stderr = Buffer.concat(err).toString();
      if (code !== 0) return reject(new Error(`${bin} exited ${code}: ${stderr.slice(-1500)}`));
      resolve({ stdout: Buffer.concat(out), stderr });
    });
  });
}

async function probe(file) {
  const { stdout } = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const j = JSON.parse(stdout.toString());
  const v = j.streams.find((s) => s.codec_type === "video");
  const a = j.streams.find((s) => s.codec_type === "audio");
  if (!v) throw new Error("No video stream found in " + file);
  let [w, h] = [v.width, v.height];
  // phone footage often carries a rotation tag; ffmpeg auto-rotates, so swap dims to match
  const rot = Math.abs(Number(v.tags?.rotate || v.side_data_list?.find((d) => d.rotation != null)?.rotation || 0)) % 180;
  if (rot === 90) [w, h] = [h, w];
  const [n, d] = (v.avg_frame_rate && v.avg_frame_rate !== "0/0" ? v.avg_frame_rate : v.r_frame_rate).split("/").map(Number);
  const fps = d ? n / d : 30;
  const duration = Number(j.format.duration || v.duration || 0);
  return { width: w, height: h, fps: fps > 0 && fps < 240 ? fps : 30, duration, hasAudio: !!a };
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
    onStdout(b) {
      const m = /out_time_us=(\d+)/g; let r, last;
      const s = b.toString();
      while ((r = m.exec(s))) last = r[1];
      if (last && totalSec > 0) onProgress?.(Math.min(1, Number(last) / 1e6 / totalSec));
    },
  });
}

module.exports = { FFMPEG, FFPROBE, run, probe, tinyFrames, ffmpegWithProgress };
