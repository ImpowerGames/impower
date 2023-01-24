export interface Shape {
  path?: string;
  frames?: string[];
  fps?: number;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  strokeJoin?: "round" | "miter" | "bevel" | "arcs";
  strokeCap?: "round" | "square" | "butt";
}

export interface Tiling {
  on: boolean;
  zoom: number;
  angle: number;
}

export interface Graphic {
  width: number;
  height: number;
  tiling: Tiling;
  shapes: Shape[];
}
