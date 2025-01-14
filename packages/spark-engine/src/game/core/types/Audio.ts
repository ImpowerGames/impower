import { Reference } from "./Reference";

export interface Audio extends Reference<"audio"> {
  src: string;
  volume: number;
  cues: number[];
  loop_start: number;
  loop_end: number;
}
