import { Reference } from "../../../core/types/Reference";

export interface Mixer extends Reference<"mixer"> {
  volume: number;
  mute: boolean;
}
