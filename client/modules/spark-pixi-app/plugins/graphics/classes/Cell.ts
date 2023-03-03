import { Graphics } from "./Graphics";

export interface CellOptions {
  thickness?: number;
  color?: number;
  cellWidth?: number;
  cellHeight?: number;
  verticalLines?: boolean;
  horizontalLines?: boolean;
}

export class Cell extends Graphics {
  thickness = 2;

  color = 0xffffff;

  cellWidth = 32;

  cellHeight = 32;

  verticalLines = true;

  horizontalLines = true;

  constructor(options?: CellOptions) {
    super();

    this.thickness = options?.thickness || this.thickness;
    this.color = options?.color || this.color;
    this.cellWidth =
      options?.cellWidth || options?.cellHeight || this.cellWidth;
    this.cellHeight = options?.cellHeight || this.cellWidth || this.cellHeight;
    this.verticalLines = options?.verticalLines ?? this.verticalLines;
    this.horizontalLines = options?.horizontalLines ?? this.horizontalLines;

    this.lineStyle(this.thickness, this.color, 1);

    this.moveTo(0, 0);

    if (this.verticalLines) {
      this.lineTo(0, this.cellHeight);
    } else {
      this.moveTo(0, this.cellHeight);
    }

    if (this.horizontalLines) {
      this.lineTo(this.cellWidth, this.cellHeight);
    } else {
      this.moveTo(this.cellWidth, this.cellHeight);
    }

    if (this.verticalLines) {
      this.lineTo(this.cellWidth, 0);
    } else {
      this.moveTo(this.cellWidth, 0);
    }

    if (this.horizontalLines) {
      this.lineTo(0, 0);
    } else {
      this.moveTo(0, 0);
    }
  }

  override calculateBounds(): void {
    this._bounds.clear();
    const minX = 0;
    const minY = 0;
    const maxX = this.cellWidth;
    const maxY = this.cellHeight;
    this._bounds.addFrameMatrix(this.worldTransform, minX, minY, maxX, maxY);
  }
}
