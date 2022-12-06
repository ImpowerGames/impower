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

  /** attack time in seconds (of the AHDSR envelope)
   * ~~~
   *      _____             1
   *     /|   | \
   *    / |   |  \______    0.5
   *   /  |   |   |   | \
   *  /   |   |   |   |  \  0
   *  |-A-|
   * ~~~
   */
  a?: number;
  /** hold time  in seconds (of the AHDSR envelope)
   * ~~~
   *      _____             1
   *     /|   | \
   *    / |   |  \______    0.5
   *   /  |   |   |   | \
   *  /   |   |   |   |  \  0
   *      |-H-|
   * ~~~
   */
  h?: number;
  /** decay time in seconds (of the AHDSR envelope)
   * ~~~
   *      _____             1
   *     /|   | \
   *    / |   |  \______    0.5
   *   /  |   |   |   | \
   *  /   |   |   |   |  \  0
   *          |-D-|
   * ~~~
   */
  d?: number;
  /** sustain level (0-1) (of the AHDSR envelope)
   * ~~~
   *      _____             1
   *     /|   | \
   *    / |   |  \______    0.5
   *   /  |   |   | ^ | \
   *  /   |   |   | ^ |  \  0
   *                S
   * ~~~
   */
  s?: number;
  /** release time in seconds (of the AHDSR envelope)
   * ~~~
   *      _____             1
   *     /|   | \
   *    / |   |  \______    0.5
   *   /  |   |   |   | \
   *  /   |   |   |   |  \  0
   *                  |-R-|
   * ~~~
   */
  r?: number;
}
