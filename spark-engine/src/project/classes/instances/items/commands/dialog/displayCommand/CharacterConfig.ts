import { Intonation, StressType } from "../../../../../../../game";

export interface Prosody extends Partial<Record<StressType, RegExp | string>> {
  wordPauseScale?: number;
  phrasePauseScale?: number;
  syllableLength?: number;
}

export interface CharacterConfig {
  name?: string;
  image?: string;
  color?: string;
  tone?: string;
  intonation?: Intonation;
  prosody?: Prosody;
}
