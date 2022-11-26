import { CurveType } from "../../core";
import { Note } from "./Note";
import { OscillatorType } from "./OscillatorType";

export interface Wave {
  /** note name, e.g. "C4" */
  note?: Note | number;
  /** waveform type */
  type?: OscillatorType;
  /** normalized volume (0-1) */
  velocity?: number;
  /** note will bend up or down this amount in semitones */
  bend?: number;
}

export interface Tone {
  /** time in seconds */
  time?: number;
  /** duration in seconds */
  duration?: number;

  /** oscillator waves to combine (with additive synthesis) */
  waves?: Wave[];

  /** envelope used to ease in and out amplitude */
  envelope?: {
    /** attack curve */
    attackCurve?: CurveType;
    /** release curve */
    releaseCurve?: CurveType;
    /** attack time in seconds */
    attackTime?: number;
    /** release time in seconds */
    releaseTime?: number;
  };

  /** pitch curve used to ease toward the next tone */
  pitchCurve?: CurveType;
}
