import { Reference } from "../../../core/types/Reference";

export interface Ease extends Reference<"ease"> {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
