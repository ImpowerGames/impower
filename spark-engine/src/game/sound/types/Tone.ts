import { Hertz } from "./Hertz";
import { SynthConfig } from "./Synth";

export interface Tone {
  /** time in seconds */
  time?: number;
  /** duration in seconds */
  duration?: number;
  /** pitch */
  hertz?: Hertz;
  /** volume */
  velocity?: number;
  /** timbre */
  synth?: SynthConfig;
}
