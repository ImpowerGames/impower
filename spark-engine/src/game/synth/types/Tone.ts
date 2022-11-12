import { Note } from "./Note";
import { OscillatorType } from "./OscillatorType";

export interface Tone {
  /** note name, e.g. "C4" */
  note?: Note;
  /** waveform type */
  type?: OscillatorType;
  /** normalized volume (0-1) */
  velocity?: number;
  /** time in seconds */
  time?: number;
  /** duration in seconds */
  duration?: number;
}
