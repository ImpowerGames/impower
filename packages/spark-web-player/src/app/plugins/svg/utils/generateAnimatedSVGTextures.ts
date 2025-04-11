import { Renderer, Texture } from "pixi.js";
import { generateAnimatedSVGTexture } from "./generateAnimatedSVGTexture";
import { parseSVGDurAttribute } from "./parseSVGDurAttribute";

export const generateAnimatedSVGTextures = (
  renderer: Renderer,
  svg: SVGElement,
  options?: {
    quality?: number;
    scale?: number;
    fps?: number;
  }
): Texture[] => {
  const fps = options?.fps ?? 60;
  const textures: Texture[] = [];
  const animateDurEl = Array.from(svg.getElementsByTagName("animate")).find(
    (e) => e.getAttribute("dur")
  );
  const duration = animateDurEl ? parseSVGDurAttribute(animateDurEl) : 0;
  const secondsPerFrame = 1 / fps;
  const frameCount = Math.floor(duration / secondsPerFrame);
  let time = 0;
  for (let i = 0; i < frameCount; i++) {
    if (time > duration) {
      break;
    }
    const frameTexture = generateAnimatedSVGTexture(
      renderer,
      svg,
      time,
      options
    );
    textures.push(frameTexture);
    time += secondsPerFrame;
  }
  return textures;
};
