import { SynthConfig } from "../specs/Synth";
import { Hertz } from "./Hertz";
import { Note } from "./Note";

export interface Tone {
  /** time in seconds from start */
  time?: number;
  /** duration in seconds */
  duration?: number;
  /** volume */
  velocity?: number;
  /** instrument number */
  instrument?: number;
  /** instrument configuration */
  synth?: SynthConfig;
  /** pitch (hertz, e.g. 440) */
  pitchHertz?: Hertz;
  /** pitch (midi note number, e.g. 69) */
  pitchNumber?: number;
  /** pitch (scientific pitch notation, e.g. A4) */
  pitchNote?: Note;
}
