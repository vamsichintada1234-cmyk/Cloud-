import { Composition } from "remotion";
import { FPS, Hibro01, TOTAL_FRAMES } from "./Hibro01";
import { TEE_FPS, TEE_FRAMES, TeeAd } from "./TeeAd";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Hibro01"
      component={Hibro01}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
    <Composition
      id="TeeAd"
      component={TeeAd}
      durationInFrames={TEE_FRAMES}
      fps={TEE_FPS}
      width={1080}
      height={1920}
    />
  </>
);
