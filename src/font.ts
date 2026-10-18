import { continueRender, delayRender } from "remotion";

/** Registers a local font file and blocks rendering until it has loaded. Returns the family name. */
export const loadFont = (url: string, family = "BebasNeue", descriptors?: FontFaceDescriptors): string => {
  if (typeof document === "undefined") return family;
  const handle = delayRender(`Loading font ${family}`);
  const face = new FontFace(family, `url('${url}')`, descriptors);
  face
    .load()
    .then(() => {
      document.fonts.add(face);
      continueRender(handle);
    })
    .catch((err) => {
      console.error(err);
      continueRender(handle);
    });
  return family;
};
