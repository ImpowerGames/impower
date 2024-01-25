import { Synth } from "../specs/Synth";
import { Tone } from "./Tone";

export interface AudioData {
  id: string;
  name: string;
  synth?: Synth;
  src?: string;
  cues?: number[];
  tones?: Tone[];
  volume: number;
}
