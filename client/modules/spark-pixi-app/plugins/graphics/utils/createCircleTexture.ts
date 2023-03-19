import { Renderer, Texture } from "../../core";
import { CircleGraphics, CircleOptions } from "../classes/CircleGraphics";
import { createTexture } from "./createTexture";

export const createCircleTexture = (
  renderer: Renderer,
  options?: CircleOptions & { quality?: number }
): Texture => {
  return createTexture(renderer, new CircleGraphics(options), options?.quality);
};
