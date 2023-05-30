export interface Vector2 {
  x: number;
  y: number;
}

export interface Rect {
  min: Vector2;
  max: Vector2;
}

export interface Bounds {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface BezierCurve {
  startPoint: Vector2;
  startControlPoint: Vector2;
  endControlPoint: Vector2;
  endPoint: Vector2;
}

export enum Side {
  Top = "Top",
  Bottom = "Bottom",
  Left = "Left",
  Right = "Right",
}

export enum Port {
  Input = "Input",
  Output = "Output",
}
