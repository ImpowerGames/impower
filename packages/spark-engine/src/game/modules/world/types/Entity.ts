import { Reference } from "../../../core/types/Reference";
import { Transform } from "./Transform";

export interface Entity extends Reference<"entity"> {
  transform: Transform;
  symbol: string;
  graphic?: string;
}
