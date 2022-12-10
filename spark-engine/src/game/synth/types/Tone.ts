import { Hertz } from "./Hertz";
import { Note } from "./Note";
import { SoundConfig } from "./Sound";

export interface Tone {
  /** time in seconds */
  time?: number;
  /** duration in seconds */
  duration?: number;
  /** pitch */
  note?: Note | Hertz;
  /** volume */
  velocity?: number;
  /** timbre */
  sound?: SoundConfig;
}
