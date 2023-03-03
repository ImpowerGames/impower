import { MSAA_QUALITY, SCALE_MODES } from "@pixi/core";
import { TilingSprite } from "@pixi/sprite-tiling";
import { IRenderer, Texture } from "../../core";
import { Cell } from "../classes/Cell";

export const generateGrid = (
  renderer: IRenderer,
  lineThickness?: number,
  cellSize?: number,
  rows?: number,
  columns = rows,
  verticalLines = true,
  horizontalLines = true
): Texture => {
  const color = 0xffffff;
  const thickness = lineThickness ?? 2;
  const size = cellSize ?? 32;
  const rowCount = rows ?? 10;
  const columnCount = columns ?? rowCount;
  const width = rowCount * size;
  const height = columnCount * size;
  const cell = new Cell({
    color,
    thickness,
    cellWidth: size,
    cellHeight: size,
    verticalLines,
    horizontalLines,
  });
  const texture = renderer.generateTexture(cell, {
    scaleMode: SCALE_MODES.LINEAR,
    multisample: MSAA_QUALITY.HIGH,
    resolution: window.devicePixelRatio,
  });
  const grid = new TilingSprite(texture, size, size);
  grid.position.set(0, 0);
  grid.width = width || height;
  grid.height = height || width;
  const gridTexture = renderer.generateTexture(grid, {
    scaleMode: SCALE_MODES.LINEAR,
    multisample: MSAA_QUALITY.HIGH,
    resolution: window.devicePixelRatio,
  });
  return gridTexture;
};
