import { Renderer, Texture } from "pixi.js";
import {
  generateAnimatedSVGTexture,
  GenerateAnimatedSVGTextureOptions,
} from "./generateAnimatedSVGTexture";
import { parseSVGDurAttribute } from "./parseSVGDurAttribute";

export interface GenerateAnimatedSVGTexturesOptions
  extends GenerateAnimatedSVGTextureOptions {
  fps?: number;
}

export const generateAnimatedSVGTextures = (
  renderer: Renderer,
  svg: SVGElement,
  options?: GenerateAnimatedSVGTexturesOptions
): Texture[] => {
  const { fps = 60 } = options || {};
  const textures: Texture[] = [];
  const animateDurEl = Array.from(svg.getElementsByTagName("animate")).find(
    (e) => e.getAttribute("dur")
  );
  const duration = animateDurEl ? parseSVGDurAttribute(animateDurEl) : 0;
  const secondsPerFrame = 1 / fps;
  const frameCount = Math.floor(duration / secondsPerFrame);
  let time = 0;
  for (let i = 0; i < frameCount; i++) {
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
