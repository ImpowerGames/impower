import { Asset } from "./Asset";

export interface Audio extends Asset {
  volume: number;
  loop: boolean;
  cues: number[];
}
