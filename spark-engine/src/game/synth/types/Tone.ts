import { Note } from "./Note";
import { OscillatorType } from "./OscillatorType";

export interface Wave {
  /** note name, e.g. "C4" */
  note?: Note | number;
  /** waveform type */
  type?: OscillatorType;
  /** normalized volume (0-1) */
  velocity?: number;
}

export interface Tone {
  /** pitch bend contour */
  bend?: number[];
  /** waves to combine (with additive synthesis) */
  waves?: Wave[];
  /** time in seconds */
  time?: number;
  /** duration in seconds */
  duration?: number;
}
