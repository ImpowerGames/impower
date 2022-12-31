import { StressType } from "./StressType";

export interface Prosody extends Record<StressType, RegExp | string> {
  maxSyllableLength: number;
  weakWords: readonly string[];
  contractions: readonly string[];
  voiced: RegExp | string;
  yelled: RegExp | string;
  punctuation: RegExp | string;
}
