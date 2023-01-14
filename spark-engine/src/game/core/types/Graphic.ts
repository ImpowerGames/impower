export interface Graphic {
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
  fill: {
    on: boolean;
    color: string;
  };
  stroke: {
    on: boolean;
    color: string;
    weight: number;
    join: "round" | "arcs" | "bevel";
    cap: "round" | "square" | "butt";
  };
  opacity: number;
  paths: string[];
}
