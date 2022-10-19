import * as PIXI from "pixi.js";
import { Cell } from "../classes/Cell";

export const generateGrid = (
  renderer: PIXI.AbstractRenderer,
  lineColor?: number,
  lineThickness?: number,
  cellSize?: number,
  rows?: number,
  columns?: number
): PIXI.RenderTexture => {
  const color = lineColor || 0x0000ff;
  const thickness = lineThickness || 3;
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
    scaleMode: PIXI.SCALE_MODES.LINEAR,
    multisample: PIXI.MSAA_QUALITY.HIGH,
    resolution: window.devicePixelRatio,
  });
  const grid = new PIXI.TilingSprite(texture, size, size);
  const offset = Math.floor(thickness / 2);
  grid.position.set(0, 0);
  grid.width = width + offset;
  grid.height = height + offset;
  const gridTexture = renderer.generateTexture(grid, {
    scaleMode: PIXI.SCALE_MODES.LINEAR,
    multisample: PIXI.MSAA_QUALITY.HIGH,
    resolution: window.devicePixelRatio,
  });
  return gridTexture;
};
