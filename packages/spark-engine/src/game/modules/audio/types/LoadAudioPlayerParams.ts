import { Synth } from "./Synth";
import { Tone } from "./Tone";

export interface LoadAudioPlayerParams {
  channel: string;
  mixer: string;
  key: string;
  type: string;
  name: string;
  synth?: Synth;
  src?: string;
  cues?: number[];
  tones?: Tone[];
  volume: number;
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;
  syncedTo?: string;
}
