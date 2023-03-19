import { Renderer, Texture } from "../../core";
import { CircleOptions } from "../classes/CircleGraphics";
import { PlaneGraphics } from "../classes/PlaneGraphics";
import { createTexture } from "./createTexture";

export const createPlaneTexture = (
  renderer: Renderer,
  options?: CircleOptions & { quality?: number }
): Texture => {
  return createTexture(renderer, new PlaneGraphics(options), options?.quality);
};
