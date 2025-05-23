import { Reference } from "../../../core/types/Reference";

export interface Shape {
  path?: string;
  frames?: string[];
  fps?: number;
  fill_color?: string;
  fill_opacity?: number;
  stroke_color?: string;
  stroke_opacity?: number;
  stroke_weight?: number;
  stroke_join?: "round" | "miter" | "bevel" | "arcs";
  stroke_cap?: "round" | "square" | "butt";
}

export interface Tiling {
  on: boolean;
  zoom: number;
  angle: number;
}

export interface Graphic extends Reference<"graphic"> {
  width: number;
  height: number;
  tiling: Tiling;
  shapes: Shape[];
  src?: string;
}
