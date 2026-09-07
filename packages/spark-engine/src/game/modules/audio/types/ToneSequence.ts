import type { SynthControllerEvent } from "./SynthControllerEvent";
import type { Tone } from "./Tone";

export interface ToneSequence {
  tones: Tone[];
  events: SynthControllerEvent[];
  sampleRate: number;
}
