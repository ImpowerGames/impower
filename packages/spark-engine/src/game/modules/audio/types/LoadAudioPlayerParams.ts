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
  samples?: Float32Array<ArrayBuffer>;
  sampleRate?: number;
  held?: boolean;
  needsSamples?: boolean;
  volume?: number;
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;
  syncedTo?: string;
  mixer?: string;
  mixerGain?: number;
}
