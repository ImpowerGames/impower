import { CurveType } from "../../core";
import { EaseType } from "../../core/types/EaseType";
import { Note } from "./Note";
import { OscillatorType } from "./OscillatorType";

export interface Wave {
  /** note name, e.g. "C4" */
  note?: Note | number;
  /** waveform type */
  type?: OscillatorType;
  /** semitones to bend pitch */
  pitchBend?: number;
  /** curve used to bend pitch */
  pitchEase?: EaseType;
  /** amount to bend volume  */
  volumeBend?: number;
  /** curve used to bend volume */
  volumeEase?: EaseType;
  /** volume relative to other waves in this tone */
  amplitude?: number;
  /** method used to merge this wave with the previous wave */
  merge?: "append" | "add";
  /** attack curve */
  attackCurve?: CurveType;
  /** release curve */
  releaseCurve?: CurveType;
  /** attack time in seconds */
  attackTime?: number;
  /** release time in seconds */
  releaseTime?: number;
}

export interface Tone {
  /** time in seconds */
  time?: number;
  /** duration in seconds */
  duration?: number;
  /** normalized volume (0-1) */
  velocity?: number;
  /** oscillator waves to merge */
  waves?: Wave[];
}
