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

export interface Graphic {
  width: number;
  height: number;
  tiling: {
    on: boolean;
    zoom: number;
    angle: number;
  };
  transform: {
    position: {
      x: number;
      y: number;
      z: number;
    };
    rotation: {
      x: number;
      y: number;
      z: number;
    };
    scale: {
      x: number;
      y: number;
      z: number;
    };
  };
  shapes: Shape[];
}
