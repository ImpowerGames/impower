import { Graphics } from "./Graphics";

export interface PillOptions {
  radius?: number;
  length?: number;
  fillColor?: number | null;
  strokeColor?: number | null;
  strokeWidth?: number;
}

export class PillGraphics extends Graphics {
  radius = 16;

  length = 16;

  fillColor: number | null = 0xffffff;

  strokeColor: number | null = 0xffffff;

  strokeWidth = 0;

  constructor(options?: PillOptions) {
    super();

    this.radius = options?.radius ?? this.radius;
    this.length = options?.length ?? this.length;
    this.fillColor =
      options?.fillColor !== undefined ? options?.fillColor : this.fillColor;
    this.strokeColor =
      options?.strokeColor !== undefined
        ? options?.strokeColor
        : this.strokeColor;
    this.strokeWidth = options?.strokeWidth ?? this.strokeWidth;

    const radius = this.radius;
    const length = this.length;
    const diameter = radius * 2;

    const x1 = radius;
    const y1 = radius;
    const startAngle1 = Math.PI;
    const endAngle1 = 0;
    const antiClockwise1 = false;

    const x2 = radius;
    const y2 = length;
    const startAngle2 = 0;
    const endAngle2 = Math.PI;
    const antiClockwise2 = false;

    if (this.strokeColor != null) {
      this.lineStyle(this.strokeWidth, this.strokeColor);
    }
    if (this.fillColor != null) {
      this.beginFill(this.fillColor);
    }
    this.moveTo(0, radius);
    this.arc(x1, y1, radius, startAngle1, endAngle1, antiClockwise1);
    this.lineTo(diameter, radius + length);
    this.arc(x2, radius + y2, radius, startAngle2, endAngle2, antiClockwise2);
    this.lineTo(0, radius);
    if (this.fillColor != null) {
      this.endFill();
    }
  }

  override calculateBounds(): void {
    this._bounds.clear();
    const minX = -this.strokeWidth / 2;
    const minY = -this.strokeWidth / 2;
    const maxX = this.radius * 2 + this.strokeWidth / 2;
    const maxY = this.radius * 2 + this.length + this.strokeWidth / 2;
    this._bounds.addFrameMatrix(this.worldTransform, minX, minY, maxX, maxY);
  }
}
