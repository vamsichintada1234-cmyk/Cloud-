/** TeeAd: beat-synced photo-tee process ad (1080x1920). All timing comes from teeTimeline.json, written
 *  by tee_prep.py from the music analysis: shots start on beats, text builds on the shot's first beat,
 *  yellow accents pop on the following beats, transitions lead into the beat so the new shot lands on it. */
import { loadFont } from "./font";
import tl from "./teeTimeline.json";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  OffthreadVideo,
  random,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

export const TEE_FPS = tl.fps;
export const TEE_FRAMES = tl.totalFrames;
const shotFile = (id: string) => staticFile(`raw/tee/shots/${id}`);
const asset = (path: string) => staticFile(`assets/${path}`);
const HEAD = loadFont(asset("fonts/Anton-Regular.ttf"), "Anton");
const BADGE = loadFont(asset("fonts/Montserrat.ttf"), "Montserrat", { weight: "100 900" });
const YELLOW = "#FFD60A";
const LEAD = 3; // transitions start this many frames before the beat
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type Exit = "cut" | "whip" | "whipUp" | "glitch" | "zoom";
type Enter = "cut" | "whip" | "whipUp" | "glitch" | "flash" | "drop";
type Text = { badge?: string; lines: [string, string]; accent?: string; underline?: boolean; built?: boolean };
type Look = { scale: [number, number]; rotate?: [number, number]; filter?: string; vignette?: boolean };

// no on-screen text: shots carry look + transition only (Headline stays available via `text`)
const PLAN: Record<string, { text?: Text; look: Look; exit: Exit }> = {
  hook: { look: { scale: [1.0, 1.12], filter: "contrast(1.1) brightness(0.95)", vignette: true }, exit: "cut" },
  step1: { look: { scale: [1.04, 1.1] }, exit: "whip" },
  step2: { look: { scale: [1.04, 1.1] }, exit: "whip" },
  step3: { look: { scale: [1.04, 1.1] }, exit: "whip" },
  step4: { look: { scale: [1.04, 1.08] }, exit: "cut" },
  wait: { look: { scale: [1.0, 1.03] }, exit: "cut" },
  doneA: { look: { scale: [1.06, 1.1] }, exit: "cut" },
  doneB: { look: { scale: [1.04, 1.1] }, exit: "whipUp" },
  made: { look: { scale: [1.05, 1.14], filter: "brightness(0.85) contrast(1.2) saturate(1.1)", vignette: true }, exit: "whip" },
  any: { look: { scale: [1.3, 1.5], rotate: [-3, 6], filter: "brightness(0.9) contrast(1.15)", vignette: true }, exit: "glitch" },
  wear: { look: { scale: [1.04, 1.14] }, exit: "zoom" },
};

const SHOTS = tl.shots.filter((s) => s.id !== "end");
const END = tl.shots.find((s) => s.id === "end")!;
const ENTER: Record<Exit, Enter> = { cut: "cut", whip: "whip", whipUp: "whipUp", glitch: "glitch", zoom: "cut" };
const enterOf = (i: number): Enter =>
  i === 0 ? "cut" : SHOTS[i].beat === tl.dropBeat ? "drop" : i === 1 ? "flash" : ENTER[PLAN[SHOTS[i - 1].id].exit];
/** frames from the shot's first frame to the n-th beat of the shot */
const beatAt = (shot: { beat: number; from: number }, n: number) => tl.beatFrames[shot.beat + n] - shot.from;

/** One-axis gaussian blur via SVG (CSS blur() can't do directional motion blur). */
const BlurFilters: React.FC<{ id: string; x: number; y: number; rgb: number }> = ({ id, x, y, rgb }) => (
  <svg width={0} height={0} style={{ position: "absolute" }}>
    <filter id={`mb-${id}`} x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation={`${x} ${y}`} />
    </filter>
    <filter id={`rgb-${id}`}>
      <feColorMatrix in="SourceGraphic" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r" />
      <feOffset in="r" dx={rgb} result="r2" />
      <feColorMatrix in="SourceGraphic" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g" />
      <feColorMatrix in="SourceGraphic" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b" />
      <feOffset in="b" dx={-rgb} result="b2" />
      <feComposite in="r2" in2="g" operator="arithmetic" k2={1} k3={1} result="rg" />
      <feComposite in="rg" in2="b2" operator="arithmetic" k2={1} k3={1} />
    </filter>
  </svg>
);

const Headline: React.FC<{ text: Text; shot: { beat: number; from: number } }> = ({ text, shot }) => {
  const frame = useCurrentFrame();
  const built = text.built ? 1000 : 0; // a continuation shot shows the headline already complete
  const t = frame + built;
  // characters rise out of a mask, line 2 just behind line 1: done well inside the first beat
  const line = (s: string, li: number, size: number) => (
    <div style={{ overflow: "hidden", lineHeight: 1.02, paddingTop: 6, marginTop: li ? -8 : 0 }}>
      {[...s].map((ch, ci) => {
        const p = interpolate(t, [li * 3 + ci * 0.7, li * 3 + ci * 0.7 + 5], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        return (
          <span key={ci} style={{ display: "inline-block", transform: `translateY(${(1 - p) * 105}%)`, whiteSpace: "pre", fontSize: size }}>
            {ch}
          </span>
        );
      })}
    </div>
  );
  // yellow accents pop one per beat, starting on the beat after the shot begins
  const pop = (n: number) => {
    const at = text.built ? -1000 : beatAt(shot, n);
    return interpolate(frame, [at, at + 3, at + 6], [0, 1.35, 1], clamp);
  };
  const ul = text.built ? 1 : interpolate(frame, [beatAt(shot, 2), beatAt(shot, 2) + 6], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const badge = text.built ? 1 : interpolate(frame, [0, 3, 6], [0, 1.15, 1], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 80px 400px", fontFamily: HEAD, color: "white" }}>
      <div style={{ textShadow: "0 6px 30px rgba(0,0,0,0.45)" }}>
        {text.badge && (
          <div
            style={{
              display: "inline-block", background: YELLOW, color: "#111", fontFamily: BADGE, fontWeight: 800,
              fontSize: 54, letterSpacing: "0.1em", padding: "12px 26px", borderRadius: 14, marginBottom: 20,
              transform: `scale(${badge})`, transformOrigin: "left center", textShadow: "none",
            }}
          >
            {text.badge}
          </div>
        )}
        {line(text.lines[0], 0, 118)}
        <div style={{ display: "inline-block", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            {line(text.lines[1], 1, 210)}
            {[...(text.accent ?? "")].map((ch, i) => (
              <span key={i} style={{ color: YELLOW, fontSize: 210, lineHeight: 1, display: "inline-block", transform: `scale(${pop(1 + i)})`, transformOrigin: "50% 80%" }}>
                {ch}
              </span>
            ))}
          </div>
          {text.underline && (
            <div style={{ height: 18, background: YELLOW, borderRadius: 4, marginTop: 4, transform: `scaleX(${ul})`, transformOrigin: "left" }} />
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Shot: React.FC<{ i: number }> = ({ i }) => {
  const shot = SHOTS[i];
  const { look, text, exit } = PLAN[shot.id];
  const enter = enterOf(i);
  const frame = useCurrentFrame();
  const dur = shot.dur;
  const src = shotFile(`${shot.id}.mp4`);

  // exit runs over the last LEAD frames (before the next beat); enter over the first frames after it
  const e = interpolate(frame, [dur - LEAD - 1, dur - 1], [0, 1], clamp);
  const n = interpolate(frame, [0, LEAD], [1, 0], clamp);
  let tx = 0, ty = 0, bx = 0, by = 0, rgb = 0, zoom = 1, flash = 0;
  // whips: short travel + heavy one-axis blur, overscaled so the frame edge never shows
  if (exit === "whip") { tx -= e * e * 12; bx += e * 80; }
  if (exit === "whipUp") { ty -= e * e * 8; by += e * 80; }
  if (enter === "whip") { tx += n * n * 9; bx += n * 55; }
  if (enter === "whipUp") { ty += n * n * 6; by += n * 55; }
  const whipScale = 1 + Math.max(bx, by) * 0.004;
  if (exit === "glitch") rgb = e * 28;
  if (enter === "glitch") rgb = n * 22;
  if (exit === "zoom") { zoom = 1 + e * e * 0.6; }
  if (enter === "flash" || enter === "drop") flash = interpolate(frame, [0, 5], [0.85, 0], clamp);
  if (enter === "drop" && frame < 7) {
    const amp = (7 - frame) * 3.2;
    tx += ((random(`sx${frame}`) - 0.5) * amp) / 10.8;
    ty += ((random(`sy${frame}`) - 0.5) * amp) / 19.2;
  }
  // the lever shot punches in when the press slams shut (its second beat)
  const punch = shot.id === "step4" ? interpolate(frame - beatAt(shot, 1), [0, 2, 8], [0, 0.05, 0], clamp) : 0;
  const glitching = rgb > 0.5;
  const scale = interpolate(frame, [0, dur], look.scale) + punch;
  const rot = look.rotate ? interpolate(frame, [0, dur], look.rotate) : 0;
  const filters = [bx || by ? `url(#mb-${shot.id})` : "", glitching ? `url(#rgb-${shot.id})` : "", look.filter ?? ""].join(" ");

  const video = (extra?: React.CSSProperties) => (
    <AbsoluteFill style={{ transform: `scale(${scale}) rotate(${rot}deg)`, ...extra }}>
      <OffthreadVideo src={src} muted style={{ width: "100%", height: "100%" }} />
    </AbsoluteFill>
  );
  const slice = (k: number) => {
    const top = Math.floor(random(`gt${shot.id}${frame}${k}`) * 85);
    return video({ clipPath: `inset(${top}% 0 ${100 - top - 6 - k * 4}% 0)`, translate: `${(random(`gx${shot.id}${frame}${k}`) - 0.5) * 160}px 0` });
  };
  return (
    <AbsoluteFill style={{ backgroundColor: "black", overflow: "hidden" }}>
      <BlurFilters id={shot.id} x={bx} y={by} rgb={rgb} />
      <AbsoluteFill style={{ transform: `translate(${tx}%, ${ty}%) scale(${zoom * whipScale})`, filter: filters, opacity: exit === "zoom" ? 1 - e * 0.3 : 1 }}>
        {video()}
        {glitching && [0, 1].map(slice)}
        {exit === "zoom" && e > 0 && [1, 2, 3].map((k) => video({ transform: `scale(${scale * (1 + e * 0.12 * k)})`, opacity: 0.35 }))}
        {look.vignette && <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.65) 100%)" }} />}
        {text && <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 48%)" }} />}
        {text && <Headline text={text} shot={shot} />}
      </AbsoluteFill>
      {flash > 0 && <AbsoluteFill style={{ background: "white", opacity: flash }} />}
    </AbsoluteFill>
  );
};

/** End card: the tee hero lands on the final strong beat (zoom-blur settle) and pushes in slowly. */
const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const settle = interpolate(frame, [0, 6], [1.25, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ backgroundColor: "black", transform: `scale(${settle})` }}>
      <Img src={shotFile("endcard.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.8) contrast(1.15)", transform: `scale(${1.05 + frame * 0.002})` }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.75) 100%)" }} />
    </AbsoluteFill>
  );
};

export const TeeAd: React.FC = () => {
  const frame = useCurrentFrame();
  const tail = TEE_FRAMES - END.from; // fade to pure black across the end card as the music runs out
  const black = interpolate(frame, [TEE_FRAMES - Math.min(tail, 28), TEE_FRAMES - 1], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {SHOTS.map((s, i) => (
        <Sequence key={s.id} from={s.from} durationInFrames={s.dur}>
          <Shot i={i} />
        </Sequence>
      ))}
      <Sequence from={END.from} durationInFrames={END.dur}>
        <EndCard />
      </Sequence>
      <AbsoluteFill style={{ background: "black", opacity: black }} />
      <Audio
        src={shotFile("music.wav")}
        volume={(fr) => interpolate(fr, [TEE_FRAMES - 30, TEE_FRAMES - 1], [1, 0], clamp)}
      />
    </AbsoluteFill>
  );
};
