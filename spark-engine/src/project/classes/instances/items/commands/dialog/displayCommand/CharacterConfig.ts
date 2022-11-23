import { Intonation, StressType } from "../../../../../../../game";

export interface Prosody extends Partial<Record<StressType, RegExp | string>> {
  wordPauseScale?: number;
  phrasePauseScale?: number;
  beepDurationScale?: number;
  syllableLength?: number;
  italicizedPauseScale: number;
  boldedPauseScale: number;
  underlinedPauseScale: number;
  capitalizedPauseScale: number;
  pitchIncrement?: number;
}

export interface CharacterConfig {
  name?: string;
  image?: string;
  color?: string;
  tone?: string;
  intonation?: Intonation;
  prosody?: Prosody;
}
