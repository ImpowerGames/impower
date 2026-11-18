import { type Reference } from "../../../core/types/Reference";

export interface Framing extends Reference<"framing"> {
  x?: string | number;
  y?: string | number;
  zoom?: number;
}
