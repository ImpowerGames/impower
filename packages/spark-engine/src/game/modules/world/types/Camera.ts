import { Transform } from "./Transform";

export interface Camera {
  transform: Transform;
  depth: "top-down" | "side-scroller";
  type: "orthographic" | "perspective";
  width: number;
  height: number;
  fit: "cover" | "contain";
  background: string;
  color: string;
}
