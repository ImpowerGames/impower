import { Graphics } from "./Graphics";

export interface PlaneOptions {
  fillColor?: number | null;
  strokeColor?: number | null;
  strokeWidth?: number;
  pixelsPerUnit?: number;
}

export class PlaneGraphics extends Graphics {
  fillColor: number | null = 0xffffff;

  strokeColor: number | null = 0xffffff;

  strokeWidth = 0;

  pixelsPerUnit = 32;

  constructor(options?: PlaneOptions) {
    super();

    this.pixelsPerUnit = options?.pixelsPerUnit ?? this.pixelsPerUnit;
    this.fillColor =
      options?.fillColor !== undefined ? options?.fillColor : this.fillColor;
    this.strokeColor =
      options?.strokeColor !== undefined
        ? options?.strokeColor
        : this.strokeColor;
    this.strokeWidth = options?.strokeWidth ?? this.strokeWidth;

    const lineWidth = this.getLineWidth();

    if (this.strokeColor != null) {
      this.lineStyle(lineWidth, this.strokeColor);
    }
    if (this.fillColor != null) {
      this.beginFill(this.fillColor);
    }
    this.drawRect(0, 0, this.pixelsPerUnit, this.pixelsPerUnit);
    if (this.fillColor != null) {
      this.endFill();
    }
  }

  getLineWidth(): number {
    return this.strokeWidth;
  }

  override calculateBounds(): void {
    this._bounds.clear();
    const minX = 0;
    const minY = 0;
    const maxX = this.pixelsPerUnit;
    const maxY = this.pixelsPerUnit;
    this._bounds.addFrameMatrix(this.worldTransform, minX, minY, maxX, maxY);
  }
}
