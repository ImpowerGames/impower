import { Graphics } from "pixi.js";

export interface CellOptions {
  thickness?: number;
  color?: number;
  size?: number;
}

export class Cell extends Graphics {
  thickness = 2;

  color = 0xffffff;

  size = 32;

  constructor(options?: CellOptions) {
    super();

    this.thickness = options?.thickness || this.thickness;
    this.color = options?.color || this.color;
    this.size = options?.size || this.size;

    this.lineStyle(this.thickness, this.color);
    this.moveTo(0, 0);
    this.lineTo(0, this.size);

    this.lineStyle(this.thickness, this.color);
    this.moveTo(0, 0);
    this.lineTo(this.size, 0);
  }

  override calculateBounds(): void {
    this._bounds.clear();
    const minX = 0;
    const minY = 0;
    const maxX = this.size;
    const maxY = this.size;
    this._bounds.addFrameMatrix(this.worldTransform, minX, minY, maxX, maxY);
  }
}
