import { Asset } from "../../core/types/Asset";

export interface AudioGroup {
  assets: Asset[];
  cues: number[];
  loop: boolean;
  volume: number;
}
