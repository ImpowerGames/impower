import { Renderer, Texture } from "pixi.js";
import {
  generateAnimatedSVGTexture,
  GenerateAnimatedSVGTextureOptions,
} from "./generateAnimatedSVGTexture";
import { parseSVGDurAttribute } from "./parseSVGDurAttribute";

export interface GenerateAnimatedSVGTexturesOptions
  extends GenerateAnimatedSVGTextureOptions {
  fps?: number;
  batchCount?: number;
  duration?: number;
}

export const generateAnimatedSVGTextures = async (
  renderer: Renderer,
  svg: SVGElement,
  options?: GenerateAnimatedSVGTexturesOptions
): Promise<Texture[]> => {
  const { fps = 60, batchCount = 50 } = options || {};
  const textures: Texture[] = [];
  const animateDurEl = Array.from(svg.getElementsByTagName("animate")).find(
    (e) => e.getAttribute("dur")
  );
  const animationDuration = animateDurEl
    ? parseSVGDurAttribute(animateDurEl)
    : 0;
  const duration = options?.duration ?? animationDuration;
  const textureCount = duration * fps;
  const secondsPerTexture = animationDuration / textureCount;
  let time = 0;
  for (let i = 0; i < textureCount; i++) {
    if (i > 0 && i % batchCount === 0) {
      // Wait so we don't generate too many textures in the same frame
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    }
    const frameTexture = generateAnimatedSVGTexture(
      renderer,
      svg,
      time,
      options
    );
    textures.push(frameTexture);
    time += secondsPerTexture;
  }

  // Wait to so we don't generate too many textures in the same frame
  await new Promise((resolve) => window.requestAnimationFrame(resolve));

  return textures;
};
