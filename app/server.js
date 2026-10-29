// RefCut: edit raw clips in the style of a reference video. Zero-dependency Node server + ffmpeg.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { analyzeReference, analyzeClip } = require("./lib/analyze");
const { buildPlan } = require("./lib/plan");
const { renderPlan } = require("./lib/render");
const { run, FFMPEG } = require("./lib/ff");

const PORT = Number(process.env.PORT || 5173);
// HOST: interface to listen on (default: all, so phones on the same Wi-Fi can connect; the Android app uses 127.0.0.1)
const DATA = path.resolve(process.env.REFCUT_DATA || path.join(__dirname, "data"));
const PUBLIC = path.join(__dirname, "public");
fs.mkdirSync(DATA, { recursive: true });

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/mp4",
  ".mkv": "video/x-matroska", ".jpg": "image/jpeg", ".json": "application/json" };

// ---------- projects ----------
const projects = new Map(); // id -> project (cached; persisted to project.json)
const analysisCache = new Map(); // id -> { ref, clips }

const dirOf = (id) => path.join(DATA, id);
function save(p) { fs.writeFileSync(path.join(dirOf(p.id), "project.json"), JSON.stringify(p, null, 1)); }
function load(id) {
  if (!/^[a-f0-9]{12}$/.test(id)) return null;
  if (projects.has(id)) return projects.get(id);
  const f = path.join(dirOf(id), "project.json");
  if (!fs.existsSync(f)) return null;
  const p = JSON.parse(fs.readFileSync(f, "utf8"));
  if (p.status === "analyzing" || p.status === "rendering") Object.assign(p, { status: "error", message: "Server restarted during the job — press Edit / Render again." });
  projects.set(id, p);
  return p;
}
function create() {
  const id = crypto.randomBytes(6).toString("hex");
  fs.mkdirSync(dirOf(id), { recursive: true });
  const p = { id, createdAt: Date.now(), status: "idle", progress: 0, message: "", reference: null, clips: [], plan: null, outputs: [] };
  projects.set(id, p); save(p);
  return p;
}
const setStatus = (p, status, message = "", progress = 0) => { Object.assign(p, { status, message, progress }); save(p); };

const analysisKey = (p) => JSON.stringify([p.reference?.file, p.clips.map((c) => c?.file)]);
// analysis already computed for the project's current files (memory, then disk), or null
function cachedAnalysis(p) {
  const key = analysisKey(p);
  let a = analysisCache.get(p.id);
  if (a && a.key === key) return a;
  const f = path.join(dirOf(p.id), "analysis.json");
  if (fs.existsSync(f)) { a = JSON.parse(fs.readFileSync(f, "utf8")); if (a.key === key) { analysisCache.set(p.id, a); return a; } }
  return null;
}
async function getAnalysis(p) {
  let a = cachedAnalysis(p);
  if (a) return a;
  const key = analysisKey(p);
  setStatus(p, "analyzing", "Studying the reference video: cuts, transitions, colour and sound…", 0.02);
  const ref = await analyzeReference(path.join(dirOf(p.id), p.reference.file));
  const clips = [];
  for (let i = 0; i < p.clips.length; i++) {
    setStatus(p, "analyzing", `Scanning clip ${i + 1} of ${p.clips.length} for its best moments…`, 0.05 + (0.2 * i) / p.clips.length);
    clips.push(await analyzeClip(path.join(dirOf(p.id), p.clips[i].file)));
  }
  a = { key, ref, clips };
  analysisCache.set(p.id, a);
  fs.writeFileSync(path.join(dirOf(p.id), "analysis.json"), JSON.stringify(a));
  return a;
}

async function doRender(p, { draft = false, base = 0 } = {}) {
  const a = await getAnalysis(p);
  const version = (p.outputs.at(-1)?.version || 0) + 1;
  const file = `output-v${version}${draft ? "-draft" : ""}.mp4`;
  setStatus(p, "rendering", draft ? "Rendering quick preview…" : "Rendering your edit…", base);
  await renderPlan(JSON.parse(JSON.stringify(p.plan)), {
    clipFiles: p.clips.map((c) => path.join(dirOf(p.id), c.file)),
    clipInfos: a.clips.map((c) => c.info),
    refFile: path.join(dirOf(p.id), p.reference.file),
    out: path.join(dirOf(p.id), file),
    draft,
  }, (x) => { p.progress = base + (1 - base) * x; });
  p.outputs.push({ version, file, draft, createdAt: Date.now() });
  setStatus(p, "done", "Your edit is ready.", 1);
}

function startJob(p, fn) {
  if (p.status === "analyzing" || p.status === "rendering") throw httpError(409, "A job is already running for this project");
  setStatus(p, "analyzing", "Starting…", 0.01);
  fn().catch((e) => { console.error(e); setStatus(p, "error", String(e.message || e).slice(0, 600)); });
}

// ---------- http helpers ----------
const httpError = (code, msg) => Object.assign(new Error(msg), { code });
function json(res, code, obj) { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); }
function readJson(req, limit = 5e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(httpError(413, "Body too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { reject(httpError(400, "Invalid JSON")); } });
    req.on("error", reject);
  });
}
function saveUpload(req, dest) {
  return new Promise((resolve, reject) => {
    const tmp = dest + ".part";
    const ws = fs.createWriteStream(tmp);
    req.pipe(ws);
    ws.on("finish", () => { fs.renameSync(tmp, dest); resolve(); });
    ws.on("error", reject); req.on("error", reject);
  });
}
function sendFile(req, res, file) {
  let st; try { st = fs.statSync(file); } catch { return json(res, 404, { error: "Not found" }); }
  if (!st.isFile()) return json(res, 404, { error: "Not found" });
  const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  if (range) {
    let start = range[1] ? Number(range[1]) : st.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : st.size - 1;
    if (!(start >= 0) || start >= st.size) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }); return res.end(); }
    end = Math.min(end, st.size - 1);
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes" });
  fs.createReadStream(file).pipe(res);
}
const safeExt = (name) => { const e = path.extname(String(name || "")).toLowerCase(); return /^\.[a-z0-9]{1,5}$/.test(e) ? e : ".mp4"; };
const publicProject = (p) => { const a = p.status === "analyzing" ? null : cachedAnalysis(p); return { ...p, analysis: a ? summary(a) : undefined }; };
const summary = (a) => ({
  reference: { ...a.ref.info, duration: a.ref.duration, shots: a.ref.segments.length,
    transitions: a.ref.segments.filter((s) => s.transitionOut && s.transitionOut.type !== "cut").length, fadeIn: a.ref.fadeIn, fadeOut: a.ref.fadeOut },
  clips: a.clips.map((c) => ({ ...c.info })),
});

// ---------- routes ----------
async function route(req, res) {
  const url = new URL(req.url, "http://x");
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts[0] === "api" && parts[1] === "projects") {
    if (parts.length === 2 && req.method === "POST") return json(res, 201, create());
    const p = load(parts[2] || "");
    if (!p) throw httpError(404, "Project not found");
    const action = parts[3];

    if (!action && req.method === "GET") return json(res, 200, publicProject(p));

    if (action === "reference" && req.method === "PUT") {
      const file = "reference" + safeExt(url.searchParams.get("name"));
      await saveUpload(req, path.join(dirOf(p.id), file));
      p.reference = { file, name: url.searchParams.get("name") || file };
      save(p); return json(res, 200, p);
    }
    if (action === "clips" && req.method === "PUT") {
      const i = Number(parts[4]);
      if (!Number.isInteger(i) || i < 0 || i > 199) throw httpError(400, "Bad clip index");
      const file = `clip-${i + 1}-${Date.now()}` + safeExt(url.searchParams.get("name"));
      await saveUpload(req, path.join(dirOf(p.id), file));
      p.clips[i] = { file, name: url.searchParams.get("name") || file };
      save(p); return json(res, 200, p);
    }
    if (action === "edit" && req.method === "POST") {
      const body = await readJson(req);
      const count = Number(body.count || p.clips.length);
      if (!p.reference) throw httpError(400, "Upload the reference video first");
      p.clips = p.clips.slice(0, count);
      if (p.clips.length < count || p.clips.some((c) => !c)) throw httpError(400, "Add a clip to every box first");
      startJob(p, async () => {
        const a = await getAnalysis(p);
        setStatus(p, "analyzing", "Matching your clips to the reference shots…", 0.28);
        p.plan = buildPlan(a.ref, a.clips, { gradeStrength: body.gradeStrength ?? 0.8 });
        save(p);
        await doRender(p, { base: 0.3 });
      });
      return json(res, 202, publicProject(p));
    }
    if (action === "plan" && req.method === "PUT") {
      if (p.status === "analyzing" || p.status === "rendering") throw httpError(409, "Wait for the current job to finish");
      const plan = await readJson(req);
      validatePlan(plan, p);
      p.plan = plan; save(p);
      return json(res, 200, publicProject(p));
    }
    if (action === "render" && req.method === "POST") {
      const body = await readJson(req);
      if (!p.plan) throw httpError(400, "No edit yet");
      startJob(p, () => doRender(p, { draft: !!body.draft }));
      return json(res, 202, publicProject(p));
    }
    if (action === "thumb" && req.method === "GET") {
      const ci = Number(url.searchParams.get("clip")), t = Math.max(0, Number(url.searchParams.get("t")) || 0);
      const c = p.clips[ci]; if (!c) throw httpError(404, "No such clip");
      const out = path.join(dirOf(p.id), `thumb-${ci}-${t.toFixed(1)}-${path.basename(c.file)}.jpg`);
      if (!fs.existsSync(out)) await run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-ss", t.toFixed(2), "-i", path.join(dirOf(p.id), c.file), "-frames:v", "1", "-vf", "scale=-2:120", "-q:v", "5", "-y", out]);
      return sendFile(req, res, out);
    }
    if (action === "files" && req.method === "GET") {
      const name = path.basename(decodeURIComponent(parts[4] || ""));
      const owned = [p.reference?.file, ...p.clips.map((c) => c?.file), ...p.outputs.map((o) => o.file)];
      if (!owned.includes(name)) throw httpError(404, "Not found");
      if (url.searchParams.has("download")) res.setHeader("Content-Disposition", `attachment; filename="refcut-${name}"`);
      return sendFile(req, res, path.join(dirOf(p.id), name));
    }
    throw httpError(404, "Unknown route");
  }

  // static
  const rel = url.pathname === "/" ? "index.html" : path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) throw httpError(403, "Forbidden");
  return sendFile(req, res, file);
}

const TRANSITIONS = new Set(["cut", "fade", "dissolve", "fadeblack", "fadewhite", "wipeleft", "wiperight", "wipeup", "wipedown", "slideleft",
  "slideright", "slideup", "slidedown", "smoothleft", "smoothright", "circleopen", "circleclose", "radial", "zoomin", "pixelize", "hblur",
  "fadegrays", "squeezeh", "squeezev", "coverleft", "coverright", "revealleft", "revealright", "distance", "diagtl", "diagbr"]);
function validatePlan(plan, p) {
  const bad = (m) => { throw httpError(400, "Invalid plan: " + m); };
  if (!plan || !Array.isArray(plan.segments) || !plan.segments.length) bad("no segments");
  if (plan.segments.length > 400) bad("too many segments");
  for (const k of ["width", "height", "fps"]) if (!(plan[k] > 0)) bad(k);
  const num = (v, lo, hi, name) => { if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) bad(name); };
  for (const s of plan.segments) {
    if (!Number.isInteger(s.clip) || !p.clips[s.clip]) bad("clip");
    num(s.in, 0, 1e6, "in"); num(s.duration, 0.04, 600, "duration"); num(s.speed, 0.1, 8, "speed");
    num(s.zoom, 0.2, 6, "zoom"); num(s.x, -3, 3, "x"); num(s.y, -3, 3, "y"); num(s.clipVolume ?? 0, 0, 4, "clipVolume");
    const g = s.grade || {};
    num(g.brightness ?? 0, -1, 1, "brightness"); num(g.contrast ?? 1, 0, 3, "contrast"); num(g.saturation ?? 1, 0, 3, "saturation");
    for (const c of ["r", "g", "b"]) num(g[c] ?? 1, 0, 2, c);
    if (!s.transition || !TRANSITIONS.has(s.transition.type)) bad("transition");
    num(s.transition.duration ?? 0, 0, 5, "transition duration");
  }
  num(plan.fadeIn ?? 0, 0, 10, "fadeIn"); num(plan.fadeOut ?? 0, 0, 10, "fadeOut"); num(plan.refVolume ?? 1, 0, 4, "refVolume");
}

http.createServer((req, res) => {
  route(req, res).catch((e) => { if (!res.headersSent) json(res, e.code || 500, { error: e.message }); else res.end(); if (!e.code) console.error(e); });
}).listen(PORT, process.env.HOST, () => console.log(`RefCut running → http://localhost:${PORT}`));
