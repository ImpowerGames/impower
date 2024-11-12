import { Reference } from "../../../core/types/Reference";
import { Transform } from "./Transform";

export interface Camera extends Reference<"camera"> {
  transform: Transform;
  depth: "top-down" | "side-scroller";
  type: "orthographic" | "perspective";
  width: number;
  height: number;
  fit: "cover" | "contain";
  background: string;
  color: string;
}
