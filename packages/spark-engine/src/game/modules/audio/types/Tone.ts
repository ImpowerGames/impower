import { type Hertz } from "./Hertz";
import { type Note } from "./Note";

export interface Tone {
  time?: number;
  duration?: number;
  speed?: number;
  velocity?: number;
  pitch?: Hertz | Note;
  bend?: number;
  instrument?: number;
  note?: number;
  mono?: boolean;
}
