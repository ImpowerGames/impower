import { Reference } from "../../../core/types/Reference";

export interface LayeredAudio extends Reference<"layered_audio"> {
  assets: string[];
  cues: number[];
}
