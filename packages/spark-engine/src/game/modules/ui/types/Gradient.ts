import { Reference } from "../../../core/types/Reference";

export interface Gradient extends Reference<"gradient"> {
  type: "linear" | "radial";
  angle: number;
  stops: {
    color?: string;
    opacity?: number;
    position?: number | string;
  }[];
}
