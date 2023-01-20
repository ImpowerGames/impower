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
  pattern: boolean;
  width: number;
  height: number;
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
