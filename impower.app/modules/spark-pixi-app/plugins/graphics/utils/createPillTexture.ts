import { Renderer, Texture } from "../../core";
import { PillGraphics, PillOptions } from "../classes/PillGraphics";
import { createTexture } from "./createTexture";

export const createPillTexture = (
  renderer: Renderer,
  options?: PillOptions & { quality?: number }
): Texture => {
  return createTexture(renderer, new PillGraphics(options), options?.quality);
};
