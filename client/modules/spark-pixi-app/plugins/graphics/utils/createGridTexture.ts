import { TilingSprite } from "@pixi/sprite-tiling";
import { Renderer, Texture } from "../../core";
import { PlaneOptions } from "../classes/PlaneGraphics";
import { createPlaneTexture } from "./createPlaneTexture";
import { createTexture } from "./createTexture";

export const createGridTexture = (
  renderer: Renderer,
  options?: { rows?: number; columns?: number } & PlaneOptions & {
      quality?: number;
    }
): Texture => {
  const validPixelsPerUnit = options?.pixelsPerUnit ?? 32;
  const rowCount = options?.rows ?? 10;
  const columnCount = options?.columns ?? rowCount;
  const width = rowCount * validPixelsPerUnit;
  const height = columnCount * validPixelsPerUnit;
  const texture = createPlaneTexture(renderer, options);
  const grid = new TilingSprite(
    texture,
    validPixelsPerUnit,
    validPixelsPerUnit
  );
  grid.position.set(0, 0);
  grid.width = width || height;
  grid.height = height || width;
  const gridTexture = createTexture(renderer, grid, options?.quality);
  return gridTexture;
};
