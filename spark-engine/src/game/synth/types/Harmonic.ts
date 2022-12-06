import { EaseType } from "../../core/types/EaseType";
import { Hertz } from "./Hertz";
import { Note } from "./Note";
import { OscillatorType } from "./OscillatorType";

export interface Harmonic {
  /** note name (e.g. "A4") or frequency in hertz (e.g. 440) */
  note?: Note | Hertz;
  /** waveform shape (e.g. "sine" | "sawtooth" | "square" | "triangle") */
  type?: OscillatorType;
  /** volume relative to other harmonics in this wave */
  amplitude?: number;
  /** semitones to bend pitch */
  pitchBend?: number;
  /** curve used to bend pitch */
  pitchEase?: EaseType;
}
