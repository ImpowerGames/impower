import { Asset } from "../../core/types/Asset";

export interface AudioGroup {
  tracks: Asset[];
  stops: number[];
}
