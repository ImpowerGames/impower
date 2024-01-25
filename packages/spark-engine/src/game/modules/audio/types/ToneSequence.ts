import { SynthControllerEvent } from "./SynthControllerEvent";
import { Tone } from "./Tone";

export interface ToneSequence {
  tones: Tone[];
  events: SynthControllerEvent[];
  sampleRate: number;
}
