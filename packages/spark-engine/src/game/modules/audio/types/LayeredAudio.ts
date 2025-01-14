import { Reference } from "../../../core/types/Reference";

export interface LayeredAudio extends Reference<"layered_audio"> {
  assets: (Reference<"audio"> | Reference<"synth">)[];
  cues: number[];
  loop_start: number;
  loop_end: number;
}
