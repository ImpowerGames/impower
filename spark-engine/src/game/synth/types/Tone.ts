import { CurveType } from "../../core";
import { Note } from "./Note";
import { OscillatorType } from "./OscillatorType";

export interface Wave {
  /** note name, e.g. "C4" */
  note?: Note | number;
  /** pitch bend */
  bend?: number;
  /** waveform type */
  type?: OscillatorType;
  /** normalized volume (0-1) */
  velocity?: number;
}

export interface Tone {
  /** pitch curve */
  pitchCurve?: CurveType;
  /** pitch curve */
  velocityCurve?: CurveType;
  /** waves to combine (with additive synthesis) */
  waves?: Wave[];
  /** time in seconds */
  time?: number;
  /** duration in seconds */
  duration?: number;
}
