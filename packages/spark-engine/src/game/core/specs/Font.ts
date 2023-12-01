import { Asset } from "./Asset";

export interface Font extends Asset {
  weight: number;
  style: "normal" | "italic" | "oblique";
}
