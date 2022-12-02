import { Intonation, StressType } from "../../../../../../../game";

export interface Prosody extends Partial<Record<StressType, RegExp | string>> {
  wordPauseScale?: number;
  phrasePauseScale?: number;
  ellipsisPauseScale?: number;
  maxSyllableLength?: number;
  italicizedPauseScale: number;
  boldedPauseScale: number;
  underlinedPauseScale: number;
  yelledPauseScale: number;
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
  tone?: string;
  intonation?: Intonation;
  prosody?: Prosody;
}
