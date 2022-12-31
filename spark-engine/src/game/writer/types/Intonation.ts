import { Inflection } from "./Inflection";
import { StressType } from "./StressType";

export interface Intonation extends Record<StressType, Inflection> {
  phrasePitchMaxOffset: number;
  phrasePitchIncrement: number;
  downdriftIncrement: number;
  syllableFluctuation: number;
  stressLevelSemitones: number;
}
