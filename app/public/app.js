// RefCut front-end: setup → automatic edit → output → editor.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (v != null && v !== false) el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c);
  return el;
};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const fmt = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, "0")}`; };
const r3 = (x) => Math.round(x * 1000) / 1000;

let project = null;
const api = async (method, url, body) => {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};
const fileUrl = (name) => `/api/projects/${project.id}/files/${encodeURIComponent(name)}`;

function toast(msg, err = false) {
  const t = $("#toast"); t.textContent = msg; t.className = "toast" + (err ? " err" : ""); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), err ? 6000 : 2500);
}

// ---------------- views ----------------
function show(view) {
  for (const v of $$(".view")) v.hidden = v.id !== "view-" + view;
  $("#topbar").hidden = view === "home";
  $("#tabs").hidden = !(project && project.plan);
  for (const t of $$(".tab")) t.classList.toggle("active", t.dataset.tab === view);
  if (view !== "editor") Editor.stop();
}

$("#startBtn").onclick = async () => {
  project = await api("POST", "/api/projects");
  location.hash = "p=" + project.id;
  Setup.open();
};
$("#homeLink").onclick = () => { if (project?.plan) show("output"); else show("home"); };
$("#newProject").onclick = () => { if (confirm("Start a new project? (This one stays saved at its link.)")) { location.hash = ""; location.reload(); } };
for (const t of $$(".tab")) t.onclick = () => (t.dataset.tab === "editor" ? Editor.open() : Output.open());

// ---------------- uploads ----------------
function upload(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => (x.status < 300 ? resolve(JSON.parse(x.responseText)) : reject(new Error(JSON.parse(x.responseText || "{}").error || x.statusText)));
    x.onerror = () => reject(new Error("Upload failed"));
    x.send(file);
  });
}

// a drop box that previews + uploads a video file
function dropBox(el, { onFile, existing }) {
  const input = $("input", el), prev = $(".drop-preview", el), bar = $(".drop-bar i", el), name = $(".drop-name", el);
  const showFile = (src, label) => {
    prev.src = src; prev.hidden = false; el.classList.add("filled"); name.textContent = label; $(".drop-empty", el).hidden = true;
    prev.onloadeddata = () => { prev.currentTime = Math.min(1, prev.duration / 3 || 0); };
  };
  if (existing) { showFile(existing.url, existing.name); bar.style.width = "100%"; }
  const take = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i.test(file.name)) return toast("Please choose a video file", true);
    showFile(URL.createObjectURL(file), file.name);
    bar.style.width = "0"; bar.style.background = "";
    try { await onFile(file, (x) => (bar.style.width = x * 100 + "%")); bar.style.width = "100%"; }
    catch (e) { bar.style.background = "var(--danger)"; toast(e.message, true); }
  };
  input.onchange = () => take(input.files[0]);
  el.ondragover = (e) => { e.preventDefault(); el.classList.add("over"); };
  el.ondragleave = () => el.classList.remove("over");
  el.ondrop = (e) => { e.preventDefault(); el.classList.remove("over"); take(e.dataTransfer.files[0]); };
}

// ---------------- setup ----------------
const Setup = {
  uploading: 0,
  open() {
    show("setup");
    const ref = $("#refDrop");
    dropBox(ref, {
      existing: project.reference && { url: fileUrl(project.reference.file), name: project.reference.name },
      onFile: (f, prog) => this.track(upload(`/api/projects/${project.id}/reference?name=${encodeURIComponent(f.name)}`, f, prog)),
    });
    const n = project.clips.length || 5;
    $("#clipCount").value = n;
    this.grid(n);
  },
  async track(promise) {
    this.uploading++; this.check();
    try { project = await promise; } finally { this.uploading--; this.check(); }
  },
  grid(n) {
    const grid = $("#clipGrid");
    const old = grid.children.length;
    // keep boxes that already exist, add/remove at the end
    while (grid.children.length > n) grid.lastChild.remove();
    for (let i = old; i < n; i++) {
      const c = project.clips[i];
      const box = h("label", { class: "drop clip-box" },
        h("input", { type: "file", accept: "video/*", hidden: true }),
        h("span", { class: "num" }, String(i + 1)),
        h("div", { class: "drop-empty" }, h("span", { class: "plus" }, "＋"), h("span", {}, `Clip ${i + 1}`)),
        h("video", { class: "drop-preview", muted: true, playsinline: true, hidden: true }),
        h("div", { class: "drop-bar" }, h("i")),
        h("div", { class: "drop-name" }));
      grid.append(box);
      dropBox(box, {
        existing: c && { url: fileUrl(c.file), name: c.name },
        onFile: (f, prog) => this.track(upload(`/api/projects/${project.id}/clips/${i}?name=${encodeURIComponent(f.name)}`, f, prog)),
      });
    }
    this.check();
  },
  count() { return clamp(parseInt($("#clipCount").value, 10) || 1, 1, 50); },
  check() {
    const n = this.count();
    const missing = [];
    if (!project?.reference) missing.push("reference video");
    for (let i = 0; i < n; i++) if (!project?.clips[i]) missing.push(`clip ${i + 1}`);
    $("#editBtn").disabled = !!missing.length || this.uploading > 0;
    $("#setupHint").textContent = this.uploading ? "Uploading…" : missing.length ? "Still needed: " + missing.slice(0, 6).join(", ") + (missing.length > 6 ? "…" : "") : "All set — press Edit.";
  },
};
$("#clipCount").oninput = () => Setup.grid(Setup.count());
$("#clipCount").onchange = () => { $("#clipCount").value = Setup.count(); Setup.grid(Setup.count()); };
$("#countMinus").onclick = () => { $("#clipCount").value = Setup.count() - 1; Setup.grid(Setup.count()); };
$("#countPlus").onclick = () => { $("#clipCount").value = Setup.count() + 1; Setup.grid(Setup.count()); };
$("#editBtn").onclick = async () => {
  try {
    project = await api("POST", `/api/projects/${project.id}/edit`, { count: Setup.count() });
    await waitJob("Editing your video…");
    Output.open();
  } catch (e) { toast(e.message, true); }
};

// poll a running job, showing the progress overlay
async function waitJob(title) {
  $("#progTitle").textContent = title; $("#overlay").hidden = false;
  try {
    for (;;) {
      project = await api("GET", `/api/projects/${project.id}`);
      $("#progMsg").textContent = project.message;
      $("#progBar").style.width = Math.round(project.progress * 100) + "%";
      if (project.status === "done") return;
      if (project.status === "error") throw new Error(project.message);
      await new Promise((r) => setTimeout(r, 700));
    }
  } finally { $("#overlay").hidden = true; }
}

// ---------------- output ----------------
const Output = {
  current: null,
  open(version) {
    show("output");
    const outs = project.outputs;
    const o = outs.find((x) => x.version === version) || outs[outs.length - 1];
    if (!o) return;
    this.current = o;
    const v = $("#outVideo");
    if (!v.src.endsWith(fileUrl(o.file))) v.src = fileUrl(o.file);
    $("#downloadBtn").href = fileUrl(o.file) + "?download=1";
    const segs = project.plan?.segments || [];
    $("#outInfo").textContent = `${project.plan.width}×${project.plan.height} · ${project.plan.fps} fps · ${fmt(segs.reduce((t, s) => t + s.duration, 0))} · ${segs.length} shots`;
    $("#versions").replaceChildren(...outs.slice().reverse().map((x) =>
      h("li", { class: x === o ? "active" : "", onclick: () => this.open(x.version) },
        `Version ${x.version}`, x.draft ? h("span", { class: "tag" }, "quick") : null, h("span", { class: "spacer" }),
        h("span", { class: "hint", style: "margin:0" }, new Date(x.createdAt).toLocaleTimeString()))));
    const a = project.analysis?.reference;
    const facts = a ? [
      `${a.shots} shots with the reference's exact cut timing`,
      a.transitions ? `${a.transitions} transition${a.transitions > 1 ? "s" : ""} (dissolves / fades / flashes) recreated` : "Hard cuts, like the reference",
      a.hasAudio ? "Reference soundtrack — music, SFX, voice — laid under the edit" : "Reference has no audio track",
      "Colour, contrast and saturation matched shot by shot",
      `Same frame size (${a.width}×${a.height}) and frame rate`,
      a.fadeIn || a.fadeOut ? "Intro / outro fades copied" : null,
    ].filter(Boolean) : [];
    $("#facts").replaceChildren(...facts.map((f) => h("li", {}, f)));
  },
};
$("#openEditorBtn").onclick = () => Editor.open();

// ---------------- editor ----------------
const TRANSITIONS = [["cut", "Cut"], ["fade", "Fade"], ["dissolve", "Dissolve"], ["fadeblack", "Dip to black"], ["fadewhite", "Flash / dip to white"],
  ["fadegrays", "Fade through grey"], ["wipeleft", "Wipe left"], ["wiperight", "Wipe right"], ["wipeup", "Wipe up"], ["wipedown", "Wipe down"],
  ["slideleft", "Slide left"], ["slideright", "Slide right"], ["slideup", "Slide up"], ["slidedown", "Slide down"], ["smoothleft", "Smooth left"],
  ["smoothright", "Smooth right"], ["coverleft", "Cover left"], ["coverright", "Cover right"], ["revealleft", "Reveal left"], ["revealright", "Reveal right"],
  ["circleopen", "Circle open"], ["circleclose", "Circle close"], ["radial", "Radial"], ["zoomin", "Zoom in"], ["pixelize", "Pixelize"],
  ["hblur", "Blur"], ["squeezeh", "Squeeze H"], ["squeezev", "Squeeze V"], ["distance", "Distance"], ["diagtl", "Diagonal ↖"], ["diagbr", "Diagonal ↘"]];
const TR_SHORT = { cut: "", dissolve: "D", fade: "F", fadeblack: "B", fadewhite: "W" };

const Editor = {
  plan: null, sel: 0, T: 0, playing: false, videos: [], audio: null, undo: [], redo: [], lastKey: null, lastAt: 0,

  open() {
    if (!project.plan) return;
    show("editor");
    if (!this.plan || this.planOf !== project.id) {
      this.plan = structuredClone(project.plan);
      this.planOf = project.id; this.undo = []; this.redo = []; this.sel = 0; this.T = 0;
      this.buildStage();
    }
    this.layout(); this.renderTimeline(); this.renderInspector(); this.draw();
  },

  // ---- model helpers
  get segs() { return this.plan.segments; },
  starts() { let t = 0; return this.segs.map((s) => { const a = t; t += s.duration; return a; }); },
  total() { return this.segs.reduce((t, s) => t + s.duration, 0); },
  segAt(T) { const st = this.starts(); for (let i = st.length - 1; i >= 0; i--) if (T >= st[i] - 1e-6) return i; return 0; },
  clipInfo(c) { return project.analysis?.clips?.[c] || { width: 1920, height: 1080, duration: 10, hasAudio: false }; },
  clipName(c) { return project.clips[c]?.name || `Clip ${c + 1}`; },

  // record an undo step (slider drags with the same key coalesce into one step)
  change(key, fn, { inspector = false } = {}) {
    const now = Date.now();
    if (key !== this.lastKey || now - this.lastAt > 900) { this.undo.push(JSON.stringify(this.plan)); this.redo = []; if (this.undo.length > 200) this.undo.shift(); }
    this.lastKey = key; this.lastAt = now;
    fn();
    this.T = clamp(this.T, 0, Math.max(0, this.total() - 0.001));
    this.sel = clamp(this.sel, 0, this.segs.length - 1);
    this.renderTimeline(); this.draw();
    if (inspector) this.renderInspector(); else this.syncInspector();
    this.scheduleSave();
  },
  history(from, to) {
    if (!from.length) return;
    to.push(JSON.stringify(this.plan)); this.plan = JSON.parse(from.pop()); this.lastKey = null;
    this.sel = clamp(this.sel, 0, this.segs.length - 1);
    this.renderTimeline(); this.renderInspector(); this.draw(); this.scheduleSave();
  },
  scheduleSave() { clearTimeout(this.saveT); this.saveT = setTimeout(() => this.save().catch((e) => toast(e.message, true)), 700); },
  async save() { clearTimeout(this.saveT); project = await api("PUT", `/api/projects/${project.id}/plan`, this.plan); },

  // ---- stage (live preview: one muted <video> per clip + the reference audio as the master clock)
  buildStage() {
    const st = $("#stage");
    st.replaceChildren(h("div", { class: "safe" }));
    $("#svgFilters").replaceChildren();
    this.videos = project.clips.map((c, i) => {
      $("#svgFilters").append(svgEl("filter", { id: "tint" + i, "color-interpolation-filters": "sRGB" }, svgEl("feColorMatrix", { type: "matrix", values: matrix(1, 1, 1) })));
      const v = h("video", { src: fileUrl(c.file), muted: true, playsinline: true, preload: "auto" });
      v.muted = true; v.style.visibility = "hidden";
      st.append(v);
      return v;
    });
    this.audio = new Audio(fileUrl(project.reference.file));
    this.audio.preload = "auto";
    this.bindStage(st);
  },
  layout() {
    const wrap = $(".stage-wrap"), st = $("#stage");
    const W = this.plan.width, H = this.plan.height;
    const bw = wrap.clientWidth || 640, bh = Math.max(160, (wrap.clientHeight || 360) - 24);
    const k = Math.min(bw / W, bh / H);
    st.style.width = Math.floor(W * k) + "px"; st.style.height = Math.floor(H * k) + "px";
    this.k = k;
  },
  // same geometry as lib/render.js `placement`
  place(v, s) {
    const W = this.plan.width, H = this.plan.height, src = this.clipInfo(s.clip), k = this.k;
    const sc = Math.max(W / src.width, H / src.height) * (s.zoom || 1);
    const vw = src.width * sc, vh = src.height * sc;
    Object.assign(v.style, {
      width: vw * k + "px", height: vh * k + "px",
      left: ((W - vw) / 2 + s.x * W) * k + "px", top: ((H - vh) / 2 + s.y * H) * k + "px",
      transform: s.flip ? "scaleX(-1)" : "",
    });
    const g = s.grade;
    $(`#tint${s.clip} feColorMatrix`).setAttribute("values", matrix(g.r, g.g, g.b));
    v.style.filter = `url(#tint${s.clip}) brightness(${1 + g.brightness * 1.6}) contrast(${g.contrast}) saturate(${g.saturation})`;
  },
  draw() {
    const T = this.T, i = this.segAt(T), s = this.segs[i], st = this.starts();
    const v = this.videos[s.clip];
    this.videos.forEach((x) => { if (x !== v) { x.style.visibility = "hidden"; if (!x.paused) x.pause(); x.muted = true; } });
    v.style.visibility = "visible";
    this.place(v, s);
    const dur = this.clipInfo(s.clip).duration;
    const target = s.in + (T - st[i]) * s.speed;
    const frozen = target >= dur - 0.05;
    const tgt = Math.min(target, Math.max(0, dur - 0.05));
    if (this.playing && !frozen) {
      v.playbackRate = clamp(s.speed, 0.0625, 16);
      v.muted = !(s.clipVolume > 0); v.volume = clamp(s.clipVolume, 0, 1);
      if (this.shown !== i || Math.abs(v.currentTime - tgt) > 0.25) v.currentTime = tgt;
      if (v.paused) v.play().catch(() => {});
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - tgt) > 0.02) v.currentTime = tgt;
    }
    this.shown = i;
    $("#playhead").style.left = T * this.pps() + "px";
    $("#timeLabel").textContent = `${fmt(T)} / ${fmt(this.total())}`;
    $("#playBtn").textContent = this.playing ? "❚❚" : "▶";
    $("#undoBtn").disabled = !this.undo.length; $("#redoBtn").disabled = !this.redo.length;
  },
  play() {
    if (this.playing) return this.stop();
    if (this.T >= this.total() - 0.05) this.T = 0;
    this.playing = true;
    const useAudio = this.plan.refAudio && this.audio;
    if (useAudio) { this.audio.currentTime = this.T; this.audio.volume = clamp(this.plan.refVolume, 0, 1); this.audio.play().catch(() => {}); }
    const t0 = performance.now(), T0 = this.T;
    const tick = () => {
      if (!this.playing) return;
      this.T = useAudio && !this.audio.paused ? this.audio.currentTime : T0 + (performance.now() - t0) / 1000;
      if (this.T >= this.total()) { this.T = this.total(); this.stop(); return; }
      const sel = this.segAt(this.T);
      if (sel !== this.sel) { this.sel = sel; this.markSel(); this.renderInspector(); }
      this.draw(); this.follow();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },
  stop() {
    if (!this.playing) return;
    this.playing = false; cancelAnimationFrame(this.raf);
    this.audio?.pause(); this.videos.forEach((v) => v.pause());
    this.draw();
  },
  seek(T) { this.T = clamp(T, 0, Math.max(0, this.total() - 0.001)); if (this.playing && this.audio) this.audio.currentTime = this.T; this.draw(); },

  bindStage(st) {
    const pts = new Map(); let base = null;
    st.onpointerdown = (e) => {
      st.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const i = this.segAt(this.T); if (i !== this.sel) this.select(i, false);
      const s = this.segs[i];
      base = { x: s.x, y: s.y, zoom: s.zoom, pts: new Map(pts) };
      st.classList.add("dragging");
    };
    st.onpointermove = (e) => {
      if (!pts.has(e.pointerId) || !base) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const s = this.segs[this.sel], W = st.clientWidth, H = st.clientHeight;
      if (pts.size >= 2 && base.pts.size >= 2) {
        const [a, b] = [...pts.values()], [a0, b0] = [...base.pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y) || 1;
        this.change("zoom", () => (s.zoom = r3(clamp(base.zoom * (d / d0), 0.2, 6))));
      } else {
        const p0 = base.pts.get(e.pointerId); if (!p0) return;
        this.change("pos", () => { s.x = r3(clamp(base.x + (e.clientX - p0.x) / W, -3, 3)); s.y = r3(clamp(base.y + (e.clientY - p0.y) / H, -3, 3)); });
      }
    };
    const up = (e) => { pts.delete(e.pointerId); base = pts.size ? { ...base, pts: new Map(pts), x: this.segs[this.sel].x, y: this.segs[this.sel].y, zoom: this.segs[this.sel].zoom } : null; if (!pts.size) st.classList.remove("dragging"); };
    st.onpointerup = up; st.onpointercancel = up;
    st.onwheel = (e) => {
      e.preventDefault();
      const i = this.segAt(this.T); if (i !== this.sel) this.select(i, false);
      const s = this.segs[this.sel];
      this.change("zoom", () => (s.zoom = r3(clamp(s.zoom * Math.exp(-e.deltaY * 0.0015), 0.2, 6))));
    };
  },

  // ---- timeline
  pps() { return Number($("#tlZoom").value); },
  renderTimeline() {
    const pps = this.pps(), st = this.starts(), total = this.total();
    const refEnd = this.plan.refCuts?.at(-1) || total;
    const width = Math.max(total, refEnd) * pps + 40;
    const ruler = $("#ruler"), track = $("#track");
    ruler.style.width = track.style.width = width + "px";
    const step = pps > 120 ? 0.5 : pps > 45 ? 1 : pps > 25 ? 2 : 5;
    const ticks = [];
    for (let t = 0; t <= Math.max(total, refEnd) + 1e-6; t += step) ticks.push(h("div", { class: "tick", style: `left:${t * pps}px` }, Number.isInteger(t) ? fmt(t).replace(/\.0$/, "") : ""));
    for (const c of this.plan.refCuts || []) ticks.push(h("div", { class: "refcut", style: `left:${c * pps}px`, title: "Cut in the reference video" }));
    ruler.replaceChildren(...ticks);
    const blocks = [];
    this.segs.forEach((s, i) => {
      const thumbT = Math.round((s.in + 0.4 * s.duration * s.speed) * 10) / 10;
      const el = h("div", { class: "seg" + (i === this.sel ? " sel" : ""), style: `left:${st[i] * pps}px;width:${Math.max(4, s.duration * pps - 2)}px;background-image:url(/api/projects/${project.id}/thumb?clip=${s.clip}&t=${Math.min(thumbT, Math.max(0, this.clipInfo(s.clip).duration - 0.1)).toFixed(1)})`, "data-i": i },
        h("div", { class: "lbl" }, `${i + 1} · ${this.clipName(s.clip)}`),
        h("div", { class: "handle", title: "Drag to change length" }));
      el.onpointerdown = (e) => this.segPointer(e, i);
      blocks.push(el);
      if (i < this.segs.length - 1 && s.transition.type !== "cut") blocks.push(h("div", { class: "tr", style: `left:${st[i + 1] * pps}px`, title: s.transition.type }, h("b", {}, TR_SHORT[s.transition.type] ?? "T")));
    });
    track.replaceChildren(...blocks);
    $("#playhead").style.left = this.T * pps + "px";
  },
  markSel() { $$("#track .seg").forEach((el) => el.classList.toggle("sel", Number(el.dataset.i) === this.sel)); },
  follow() {
    const tl = $("#timeline"), x = this.T * this.pps();
    if (x < tl.scrollLeft + 20 || x > tl.scrollLeft + tl.clientWidth - 40) tl.scrollLeft = x - tl.clientWidth / 3;
  },
  segPointer(e, i) {
    e.preventDefault();
    const pps = this.pps(), s = this.segs[i], startX = e.clientX, d0 = s.duration;
    const st = this.starts()[i];
    if (e.target.classList.contains("handle")) {
      // trim: snap the end to the reference's cut points so the rhythm stays on the beat
      const move = (ev) => {
        let d = Math.max(0.1, d0 + (ev.clientX - startX) / pps);
        for (const c of this.plan.refCuts || []) if (Math.abs(st + d - c) * pps < 7) d = c - st;
        this.change("dur" + i, () => (s.duration = r3(Math.max(0.1, d))));
      };
      const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
      addEventListener("pointermove", move); addEventListener("pointerup", up);
      this.select(i, false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    this.select(i, false);
    this.seek(st + clamp((e.clientX - rect.left) / pps, 0, s.duration - 0.001));
  },
  select(i, seek = true) {
    this.sel = clamp(i, 0, this.segs.length - 1);
    if (seek) { const st = this.starts()[this.sel]; if (this.segAt(this.T) !== this.sel) this.seek(st); }
    this.markSel(); this.renderInspector(); this.draw();
  },

  // ---- inspector
  renderInspector() {
    const s = this.segs[this.sel], i = this.sel, info = this.clipInfo(s.clip), ins = $("#inspector");
    const self = this;
    this.bound = [];
    // slider + number bound to a getter/setter
    function slider(label, min, max, step, get, set, key) {
      const r = h("input", { type: "range", min, max, step }), n = h("input", { type: "number", min, max, step });
      const sync = () => { r.value = get(); n.value = (+get()).toFixed(step < 0.01 ? 3 : 2).replace(/\.?0+$/, "") || 0; };
      r.oninput = () => self.change(key, () => set(+r.value));
      n.onchange = () => self.change(key, () => set(clamp(+n.value, +min, +max)));
      self.bound.push(sync); sync();
      return h("div", { class: "field" }, h("span", {}, label), r, n);
    }
    const select = (label, options, get, set, key, opts) => {
      const el = h("select", {}, options.map(([v, t]) => h("option", { value: v }, t)));
      el.value = get(); el.onchange = () => self.change(key, () => set(el.value), opts);
      return h("div", { class: "field" }, h("span", {}, label), el);
    };
    const maxIn = () => Math.max(0, this.clipInfo(s.clip).duration - 0.05);
    const thumb = h("img", { class: "src-thumb", alt: "" });
    const setThumb = () => { thumb.src = `/api/projects/${project.id}/thumb?clip=${s.clip}&t=${Math.min(s.in, maxIn()).toFixed(1)}`; };
    let thumbT; this.bound.push(() => { clearTimeout(thumbT); thumbT = setTimeout(setThumb, 250); }); setThumb();
    const isLast = i === this.segs.length - 1;

    ins.replaceChildren(
      h("h3", {}, `Shot ${i + 1} of ${this.segs.length}`),
      h("div", { class: "row-btns" }, h("span", { class: "badge" }, `${fmt(this.starts()[i])} → ${fmt(this.starts()[i] + s.duration)}`)),
      select("Clip", project.clips.map((c, k) => [k, `${k + 1}. ${this.clipName(k)}`]), () => s.clip, (v) => { s.clip = +v; s.in = Math.min(s.in, Math.max(0, this.clipInfo(s.clip).duration - s.duration * s.speed)); }, "clip", { inspector: true }),
      thumb,
      slider("Start in clip", 0, maxIn().toFixed(2), 0.04, () => s.in, (v) => (s.in = r3(clamp(v, 0, maxIn()))), "in" + i),
      slider("Length (s)", 0.1, 30, 0.04, () => s.duration, (v) => (s.duration = r3(Math.max(0.1, v))), "dur" + i),
      slider("Speed", 0.25, 4, 0.05, () => s.speed, (v) => (s.speed = r3(v)), "speed" + i),
      h("p", { class: "hint" }, info.duration < s.in + s.duration * s.speed ? "Clip runs out before the shot ends — the last frame is held. Lower the speed or start earlier." : ""),

      h("h3", {}, "Frame"),
      slider("Zoom", 0.2, 4, 0.01, () => s.zoom, (v) => (s.zoom = r3(v)), "zoom"),
      slider("Move ← →", -1, 1, 0.005, () => s.x, (v) => (s.x = r3(v)), "pos"),
      slider("Move ↑ ↓", -1, 1, 0.005, () => s.y, (v) => (s.y = r3(v)), "pos"),
      h("div", { class: "row-btns" },
        h("button", { class: "ghost small", onclick: () => this.change("flip", () => (s.flip = !s.flip)) }, "⇋ Flip"),
        h("button", { class: "ghost small", onclick: () => this.change("reset-frame", () => Object.assign(s, { zoom: 1, x: 0, y: 0, flip: false }), { inspector: true }) }, "Reset frame"),
        h("button", { class: "ghost small", title: "Copy this framing to every shot from the same clip", onclick: () => this.change("frame-all", () => this.segs.forEach((o) => o.clip === s.clip && Object.assign(o, { zoom: s.zoom, x: s.x, y: s.y, flip: s.flip }))) }, "Apply to clip")),

      h("h3", {}, "Colour"),
      slider("Brightness", -0.5, 0.5, 0.01, () => s.grade.brightness, (v) => (s.grade.brightness = v), "gb" + i),
      slider("Contrast", 0.3, 2, 0.01, () => s.grade.contrast, (v) => (s.grade.contrast = v), "gc" + i),
      slider("Saturation", 0, 2.5, 0.01, () => s.grade.saturation, (v) => (s.grade.saturation = v), "gs" + i),
      slider("Red", 0.5, 1.5, 0.01, () => s.grade.r, (v) => (s.grade.r = v), "gr" + i),
      slider("Green", 0.5, 1.5, 0.01, () => s.grade.g, (v) => (s.grade.g = v), "gg" + i),
      slider("Blue", 0.5, 1.5, 0.01, () => s.grade.b, (v) => (s.grade.b = v), "gbl" + i),
      h("div", { class: "row-btns" },
        h("button", { class: "ghost small", onclick: () => this.change("grade-auto", () => (s.grade = { ...s.autoGrade }), { inspector: true }) }, "Reference match"),
        h("button", { class: "ghost small", onclick: () => this.change("grade-off", () => (s.grade = { brightness: 0, contrast: 1, saturation: 1, r: 1, g: 1, b: 1 }), { inspector: true }) }, "Original colours"),
        h("button", { class: "ghost small", onclick: () => this.change("grade-all", () => this.segs.forEach((o) => (o.grade = { ...s.grade }))) }, "Apply to all")),

      h("h3", {}, isLast ? "End of video" : "Transition to next shot"),
      isLast ? null : select("Type", TRANSITIONS, () => s.transition.type, (v) => { s.transition.type = v; if (v !== "cut" && !(s.transition.duration > 0)) s.transition.duration = 0.4; }, "tr" + i, { inspector: true }),
      isLast || s.transition.type === "cut" ? null : slider("Length (s)", 0.05, 2, 0.05, () => s.transition.duration, (v) => (s.transition.duration = r3(v)), "trd" + i),

      h("h3", {}, "Sound"),
      slider("Clip's own sound", 0, 2, 0.05, () => s.clipVolume, (v) => (s.clipVolume = r3(v)), "cv" + i),
      h("p", { class: "hint" }, info.hasAudio ? "Mixed under the reference soundtrack." : "This clip has no sound."),

      h("h3", {}, "Whole video"),
      slider("Reference sound", 0, 2, 0.05, () => this.plan.refVolume, (v) => (this.plan.refVolume = r3(v)), "rv"),
      slider("Fade in (s)", 0, 3, 0.05, () => this.plan.fadeIn, (v) => (this.plan.fadeIn = r3(v)), "fi"),
      slider("Fade out (s)", 0, 3, 0.05, () => this.plan.fadeOut, (v) => (this.plan.fadeOut = r3(v)), "fo"),
      h("p", { class: "hint" }, "Live preview shows cuts, framing and approximate colour. Transitions and exact colour appear in the render."),
    );
  },
  syncInspector() { (this.bound || []).forEach((f) => f()); },

  // ---- segment operations
  split() {
    const i = this.segAt(this.T), s = this.segs[i], off = this.T - this.starts()[i];
    if (off < 0.1 || s.duration - off < 0.1) return toast("Move the playhead inside a shot to split it");
    this.change("split", () => {
      const b = structuredClone(s);
      b.in = r3(s.in + off * s.speed); b.duration = r3(s.duration - off);
      s.duration = r3(off); s.transition = { type: "cut", duration: 0 };
      this.segs.splice(i + 1, 0, b); this.sel = i + 1;
    }, { inspector: true });
  },
  duplicate() { const i = this.sel; this.change("dup", () => { this.segs.splice(i + 1, 0, structuredClone(this.segs[i])); this.sel = i + 1; }, { inspector: true }); },
  move(dir) {
    const i = this.sel, j = i + dir;
    if (j < 0 || j >= this.segs.length) return;
    this.change("move", () => { [this.segs[i], this.segs[j]] = [this.segs[j], this.segs[i]]; this.sel = j; this.T = this.starts()[j] + 0.001; }, { inspector: true });
  },
  remove() {
    if (this.segs.length < 2) return toast("An edit needs at least one shot");
    const i = this.sel;
    this.change("del", () => { this.segs.splice(i, 1); this.segs.at(-1).transition = { type: "cut", duration: 0 }; this.sel = Math.min(i, this.segs.length - 1); }, { inspector: true });
  },

  async render(draft) {
    this.stop();
    try {
      await this.save();
      project = await api("POST", `/api/projects/${project.id}/render`, { draft });
      await waitJob(draft ? "Quick render…" : "Rendering your edit…");
      Output.open();
      toast(`Version ${project.outputs.at(-1).version} ready`);
    } catch (e) { toast(e.message, true); }
  },
};

const svgEl = (tag, attrs, ...kids) => {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
};
function matrix(r, g, b) { return `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`; }

$("#playBtn").onclick = () => Editor.play();
$("#undoBtn").onclick = () => Editor.history(Editor.undo, Editor.redo);
$("#redoBtn").onclick = () => Editor.history(Editor.redo, Editor.undo);
$("#splitBtn").onclick = () => Editor.split();
$("#dupBtn").onclick = () => Editor.duplicate();
$("#leftBtn").onclick = () => Editor.move(-1);
$("#rightBtn").onclick = () => Editor.move(1);
$("#delBtn").onclick = () => Editor.remove();
$("#renderBtn").onclick = () => Editor.render(false);
$("#draftBtn").onclick = () => Editor.render(true);
$("#tlZoom").oninput = () => { Editor.renderTimeline(); Editor.draw(); };
$("#ruler").onpointerdown = (e) => {
  const r = $("#ruler").getBoundingClientRect();
  const seekTo = (ev) => Editor.seek((ev.clientX - r.left) / Editor.pps());
  seekTo(e);
  const up = () => { removeEventListener("pointermove", seekTo); removeEventListener("pointerup", up); Editor.select(Editor.segAt(Editor.T), false); };
  addEventListener("pointermove", seekTo); addEventListener("pointerup", up);
};
addEventListener("resize", () => { if (!$("#view-editor").hidden) { Editor.layout(); Editor.draw(); } });
addEventListener("keydown", (e) => {
  if ($("#view-editor").hidden || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== "range") return;
  const fps = Editor.plan.fps;
  if (e.code === "Space") { e.preventDefault(); Editor.play(); }
  else if (e.key === "s" || e.key === "S") Editor.split();
  else if (e.key === "Delete" || e.key === "Backspace") Editor.remove();
  else if (e.key === "ArrowLeft") { e.preventDefault(); Editor.seek(Editor.T - (e.shiftKey ? 1 : 1 / fps)); }
  else if (e.key === "ArrowRight") { e.preventDefault(); Editor.seek(Editor.T + (e.shiftKey ? 1 : 1 / fps)); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? Editor.history(Editor.redo, Editor.undo) : Editor.history(Editor.undo, Editor.redo); }
});

// ---------------- boot: resume a project from the URL ----------------
(async () => {
  const id = /p=([a-f0-9]{12})/.exec(location.hash)?.[1];
  if (!id) return show("home");
  try {
    project = await api("GET", `/api/projects/${id}`);
    if (project.status === "analyzing" || project.status === "rendering") await waitJob("Working…");
    if (project.plan && project.outputs.length) Output.open(); else Setup.open();
  } catch { location.hash = ""; show("home"); }
})();
