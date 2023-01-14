import { StressType } from "./StressType";

export interface Prosody extends Record<StressType, string> {
  maxSyllableLength: number;
  weakWords: readonly string[];
  contractions: readonly string[];
  voiced: string;
  yelled: string;
  punctuation: string;
}
