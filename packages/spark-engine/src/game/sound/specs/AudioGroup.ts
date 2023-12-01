import { Asset } from "../../core/specs/Asset";

export interface AudioGroup {
  assets: Asset[];
  cues: number[];
  loop: boolean;
  volume: number;
}
