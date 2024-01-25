import { Hertz } from "./Hertz";
import { Note } from "./Note";

export interface Tone {
  /** time in seconds from start */
  time?: number;
  /** duration in seconds (defaults to synth envelope duration) */
  duration?: number;
  /** speed relative to duration (defaults to 1) */
  speed?: number;
  /** volume (defaults to 1) */
  velocity?: number;
  /** pitch (hertz, e.g. 440, or scientific pitch notation, e.g. A4) */
  pitch?: Hertz | Note;
  /** number of semitones to bend the pitch up or down */
  bend?: number;
  /** midi instrument number */
  instrument?: number;
  /** midi note number (e.g. 69) */
  note?: number;
  /** monophonic */
  mono?: boolean;
}
