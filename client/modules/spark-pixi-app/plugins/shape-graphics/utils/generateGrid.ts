import { IRenderer, MSAA_QUALITY, SCALE_MODES, TilingSprite } from "pixi.js";
import { SparkTexture } from "../../../classes/wrappers/SparkTexture";
import { Cell } from "../classes/Cell";

export const generateGrid = (
  renderer: IRenderer,
  lineThickness?: number,
  cellSize?: number,
  rows?: number,
  columns?: number
): SparkTexture => {
  const color = 0xffffff;
  const thickness = lineThickness || 2;
  const size = cellSize || 32;
  const rowCount = rows || 10;
  const columnCount = columns || rowCount;
  const width = rowCount * size;
  const height = columnCount * size;
  const cell = new Cell({
    color,
    thickness,
    size,
  });
  const texture = renderer.generateTexture(cell, {
    scaleMode: SCALE_MODES.LINEAR,
    multisample: MSAA_QUALITY.HIGH,
    resolution: window.devicePixelRatio,
  });
  const grid = new TilingSprite(texture, size, size);
  grid.position.set(0, 0);
  grid.width = width;
  grid.height = height;
  const gridTexture = renderer.generateTexture(grid, {
    scaleMode: SCALE_MODES.LINEAR,
    multisample: MSAA_QUALITY.HIGH,
    resolution: window.devicePixelRatio,
  });
  return gridTexture;
};
