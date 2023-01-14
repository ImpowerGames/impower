import { Graphic, RecursivePartial } from "../../core";

export interface Pattern {
  weight: number;
  zoom: number;
  angle: number;
  colors: string[];
  graphic: RecursivePartial<Graphic>;
}
