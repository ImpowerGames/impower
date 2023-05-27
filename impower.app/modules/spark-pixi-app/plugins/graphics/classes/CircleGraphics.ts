import { Graphics } from "./Graphics";

export interface CircleOptions {
  radius?: number;
  fillColor?: number | null;
  strokeColor?: number | null;
  strokeWidth?: number;
}

export class CircleGraphics extends Graphics {
  radius = 16;

  fillColor: number | null = 0xffffff;

  strokeColor: number | null = 0xffffff;

  strokeWidth = 0;

  constructor(options?: CircleOptions) {
    super();

    this.radius = options?.radius ?? this.radius;
    this.fillColor =
      options?.fillColor !== undefined ? options?.fillColor : this.fillColor;
    this.strokeColor =
      options?.strokeColor !== undefined
        ? options?.strokeColor
        : this.strokeColor;
    this.strokeWidth = options?.strokeWidth ?? this.strokeWidth;

    if (this.strokeColor != null) {
      this.lineStyle(this.strokeWidth, this.strokeColor);
    }
    if (this.fillColor != null) {
      this.beginFill(this.fillColor);
    }
    this.drawCircle(this.radius, this.radius, this.radius);
    if (this.fillColor != null) {
      this.endFill();
    }
  }

  override calculateBounds(): void {
    this._bounds.clear();
    const minX = -this.strokeWidth / 2;
    const minY = -this.strokeWidth / 2;
    const maxX = this.radius * 2 + this.strokeWidth / 2;
    const maxY = this.radius * 2 + this.strokeWidth / 2;
    this._bounds.addFrameMatrix(this.worldTransform, minX, minY, maxX, maxY);
  }
}
