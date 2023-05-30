import { Renderer, Texture } from "../../core";
import { LineGraphics, LineOptions } from "../classes/LineGraphics";
import { createTexture } from "./createTexture";

export const createLineTexture = (
  renderer: Renderer,
  options?: LineOptions & { quality?: number }
): Texture => {
  return createTexture(renderer, new LineGraphics(options), options?.quality);
};
