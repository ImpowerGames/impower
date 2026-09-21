import { type Synth } from "./Synth";
import { type Tone } from "./Tone";

export interface LoadAudioPlayerParams {
  channel: string;
  key: string;
  type?: string;
  name?: string;
  synth?: Synth;
  src?: string;
  cues?: number[];
  tones?: Tone[];
  volume?: number;
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;
  syncedTo?: string;
  /** The mixer the player plays through, resolved by the engine from the
   *  channel. */
  mixer?: string;
  /** The gain the mixer starts at if this player is the first to need it. */
  mixerGain?: number;
}
