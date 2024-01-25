import { Asset } from "./Asset";

export interface Audio extends Asset {
  volume: number;
  cues: number[];
}
