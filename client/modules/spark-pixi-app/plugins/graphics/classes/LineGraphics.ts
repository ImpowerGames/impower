import { LINE_CAP, LINE_JOIN } from "@pixi/graphics";
import { Graphics } from "./Graphics";

export interface LineOptions {
  min?: [number, number];
  max?: [number, number];
  points?: [number, number][];
  thickness?: number;
  fillColor?: number | null;
  strokeColor?: number | null;
  strokeWidth?: number;
}

export class LineGraphics extends Graphics {
  min = [0, 0];

  max = [32, 32];

  points = [
    [16, 0],
    [16, 32],
  ];

  thickness = 1;

  fillColor: number | null = 0xffffff;

  strokeColor: number | null = 0xffffff;

  strokeWidth = 0;

  constructor(options?: LineOptions) {
    super();

    this.min = options?.min ?? this.min;
    this.max = options?.max ?? this.max;
    this.points = options?.points ?? this.points;
    this.thickness = options?.thickness ?? this.thickness;
    this.fillColor = options?.fillColor ?? this.fillColor;
    this.strokeColor = options?.strokeColor ?? this.strokeColor;
    this.strokeWidth = options?.strokeWidth ?? this.strokeWidth;

    const start = this.points[0] ?? [0, 0];

    const strokeSize = this.thickness * 2 + this.strokeWidth;

    // Stroke
    this.lineStyle(strokeSize, this.strokeColor);
    this.line.join = LINE_JOIN.ROUND;
    this.line.cap = LINE_CAP.ROUND;
    this.moveTo(start[0], start[1]);
    this.points.forEach((point) => {
      this.lineTo(point[0], point[1]);
    });

    // Fill
    this.lineStyle(this.thickness, this.fillColor);
    this.line.join = LINE_JOIN.ROUND;
    this.line.cap = LINE_CAP.ROUND;
    this.moveTo(start[0], start[1]);
    this.points.forEach((point) => {
      this.lineTo(point[0], point[1]);
    });
  }

  override calculateBounds(): void {
    let minPointX = Number.MAX_SAFE_INTEGER;
    let minPointY = Number.MAX_SAFE_INTEGER;
    let maxPointX = 0;
    let maxPointY = 0;
    this.points.forEach((point) => {
      if (point[0] < minPointX) {
        minPointX = point[0];
      }
      if (point[1] < minPointY) {
        minPointY = point[1];
      }
      if (point[0] > maxPointX) {
        maxPointX = point[0];
      }
      if (point[1] > maxPointY) {
        maxPointY = point[1];
      }
    });
    const strokeSize = this.thickness * 2 + this.strokeWidth;
    const minX = this.min[0] ?? 0;
    const minY = this.min[1] ?? 0;
    const maxX = this.max[0] ?? maxPointX;
    const maxY = this.max[1] ?? maxPointY;
    const bleed = strokeSize / 2;
    const bleedMinX = minPointX <= minX ? -bleed : 0;
    const bleedMinY = minPointY <= minY ? -bleed : 0;
    const bleedMaxX = maxPointX >= maxX ? bleed : 0;
    const bleedMaxY = maxPointY >= maxY ? bleed : 0;
    this._bounds.clear();
    this._bounds.addFrameMatrix(
      this.worldTransform,
      minX + bleedMinX,
      minY + bleedMinY,
      maxX + bleedMaxX,
      maxY + bleedMaxY
    );
  }
}
