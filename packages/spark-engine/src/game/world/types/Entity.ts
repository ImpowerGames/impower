import { Graphic } from "../specs/Graphic";
import { Transform } from "./Transform";

export interface Entity {
  transform: Transform;
  symbol: string;
  graphic?: Graphic;
}
