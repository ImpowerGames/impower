import { MSAA_QUALITY, SCALE_MODES } from "@pixi/constants";
import { IRenderableObject, Renderer, Texture } from "../../core";

export const createTexture = (
  renderer: Renderer,
  obj: IRenderableObject,
  quality = 8
): Texture => {
  const texture = renderer?.generateTexture(obj, {
    scaleMode: SCALE_MODES.LINEAR,
    multisample: MSAA_QUALITY.HIGH,
    resolution: window.devicePixelRatio * quality,
  });
  return texture;
};
