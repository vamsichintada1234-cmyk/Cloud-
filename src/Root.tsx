import { Composition } from "remotion";
import { FPS, Hibro01, TOTAL_FRAMES } from "./Hibro01";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Hibro01"
    component={Hibro01}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
