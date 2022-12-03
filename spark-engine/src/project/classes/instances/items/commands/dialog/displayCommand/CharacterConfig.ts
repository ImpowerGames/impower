import { Intonation, StressType } from "../../../../../../../game";

export interface Prosody extends Partial<Record<StressType, RegExp | string>> {
  maxSyllableLength?: number;
  weakWords?: string[];
  contractions?: string[];
  voiced?: RegExp | string;
  yelled?: RegExp | string;
  punctuation?: RegExp | string;
}

export interface CharacterConfig {
  name?: string;
  image?: string;
  color?: string;
  intonation?: Intonation;
  prosody?: Prosody;
}
