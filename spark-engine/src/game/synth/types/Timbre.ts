import { OscillatorType } from "./OscillatorType";

export interface Timbre extends Record<string, string | number | undefined> {
  /**
   * waveform type
   * "sine" | "sawtooth" | "square" | "triangle" (basic waveforms)
   * "n0" (white noise)
   * "n1" (metallic noise)
   * "w9999" (summing 1-4 harmonics)
   */
  w?: OscillatorType | "n0" | "n1" | "w9999";

  /** volume */
  v?: number;

  /** attack time (of AHDSR envelope) */
  a?: number;
  /** hold time (of AHDSR envelope) */
  h?: number;
  /** decay time (of AHDSR envelope) */
  d?: number;
  /** sustain level (of AHDSR envelope) */
  s?: number;
  /** release time (of AHDSR envelope) */
  r?: number;

  /** fixed frequency in Hz */
  f?: number;
  /** tune factor according to note */
  t?: number;

  /** pitch bend */
  p?: number;
  /** pitch bend speed factor */
  q?: number;

  /** volume key tracking factor */
  k?: number;

  /** output destination (0=final output / n=FM to specified osc) */
  g?: number;
}
