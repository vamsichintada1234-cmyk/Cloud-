/** Hibro01 edit, Remotion port of edit.py: key-shot montage with music, SFX and text (1920x1080 @ 25fps). */
import { loadFont } from "./font";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

export const FPS = 25;
const f = (s: number) => Math.round(s * FPS);
const raw = (file: string) => staticFile(`raw/${file}`);
const asset = (path: string) => staticFile(`assets/${path}`);
const FONT = loadFont(asset("fonts/BebasNeue-Regular.ttf"));

// (file, in, out) — kept segments, in story order
const SEGS: [string, number, number][] = [
  ["01.MP4", 4.5, 8.0], // walking into the factory
  ["01.MP4", 9.5, 12.0], // interior reveal
  ["01.MP4", 12.0, 14.5], // fabric stacks
  ["01.MP4", 29.5, 35.5], // cutter at work
  ["01.MP4", 41.0, 46.0], // wide: cutting the fabric stack
  ["01.MP4", 78.0, 83.0], // close-up of the blade
  ["02.MP4", 0.0, 3.5], // front angle cutting
  ["02.MP4", 31.0, 35.0], // front angle cutting (outro)
];
const starts: number[] = [];
let t = 0;
for (const [, a, b] of SEGS) {
  starts.push(t);
  t += b - a;
}
const TOTAL = t;
export const TOTAL_FRAMES = f(TOTAL);

type Style = "title" | "sub" | "lower" | "credit";
const TEXT: [string, number, number, Style][] = [
  ["INSIDE A GARMENT FACTORY", 0.3, 3.4, "title"],
  ["HIBRO  |  EP 01", 0.6, 3.4, "sub"],
  ["WHERE IT ALL BEGINS", starts[1] + 0.3, starts[2] + 2.2, "lower"],
  ["THE CUTTING SECTION", starts[3] + 0.8, starts[3] + 4.5, "lower"],
  ["STRAIGHT KNIFE CUTTING MACHINE", starts[4] + 0.5, starts[4] + 4.5, "lower"],
  ["PRECISION CUTTING", starts[5] + 0.5, starts[5] + 4.5, "lower"],
  ["MANY LAYERS. ONE CUT.", starts[6] + 0.3, starts[6] + 3.3, "lower"],
  ["SUBSCRIBE FOR MORE", TOTAL - 3.6, TOTAL, "title"],
  ["Music: Funkorama - Kevin MacLeod (incompetech.com) CC BY 4.0", TOTAL - 3.6, TOTAL, "credit"],
];
// all text kept inside the 10% title-safe area
const STYLE: Record<Style, React.CSSProperties> = {
  title: { fontSize: 130, top: 540 - 65 - 60, background: "rgba(0,0,0,0.55)", padding: 30 },
  sub: { fontSize: 56, top: 540 + 70, background: "rgba(255,196,0,0.95)", color: "black", padding: 14 },
  lower: { fontSize: 78, bottom: 150, background: "rgba(0,0,0,0.6)", padding: 22 },
  credit: { fontSize: 30, bottom: 120, background: "rgba(0,0,0,0.5)", padding: 10 },
};

// SFX: (file, time, gain)
const SFX: [string, number, number][] = [
  ["impact.wav", 0.25, 0.8],
  ["whoosh.wav", 0.5, 0.6],
  ...starts.slice(1).map((s): [string, number, number] => ["whoosh.wav", Math.max(0, s - 0.35), 0.45]),
  ...TEXT.filter(([, , , st]) => st === "lower").map(([, a]): [string, number, number] => ["pop.wav", a, 0.6]),
  ["riser.wav", starts[5] - 1.5, 0.35],
  ["ding.wav", TOTAL - 3.6, 0.6],
];

const Caption: React.FC<{ text: string; dur: number; style: Style }> = ({ text, dur, style }) => {
  const frame = useCurrentFrame();
  const fade = f(0.25);
  const opacity = interpolate(frame, [0, fade, dur - fade, dur], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          fontFamily: FONT,
          color: "white",
          lineHeight: 1,
          whiteSpace: "nowrap",
          opacity,
          ...STYLE[style],
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

export const Hibro01: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeOpacity = interpolate(
    frame,
    [0, f(0.5), TOTAL_FRAMES - f(0.8), TOTAL_FRAMES],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AbsoluteFill style={{ opacity: fadeOpacity, filter: "contrast(1.05) saturate(1.15)" }}>
        {SEGS.map(([file, a, b], i) => (
          <Sequence key={i} from={f(starts[i])} durationInFrames={f(b - a)}>
            <OffthreadVideo src={raw(file)} trimBefore={f(a)} trimAfter={f(b)} muted />
          </Sequence>
        ))}
      </AbsoluteFill>
      {TEXT.map(([text, a, b, style], i) => (
        <Sequence key={i} from={f(a)} durationInFrames={f(b - a)}>
          <Caption text={text} dur={f(b - a)} style={style} />
        </Sequence>
      ))}
      <Audio
        src={asset("music/Funkorama.mp3")}
        loop
        volume={(fr) =>
          0.8 *
          interpolate(fr, [0, f(1.5), TOTAL_FRAMES - f(2.5), TOTAL_FRAMES], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
      {SFX.map(([file, at, gain], i) => (
        <Sequence key={i} from={f(at)}>
          <Audio src={asset(`sfx/${file}`)} volume={gain} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
