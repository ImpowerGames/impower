import { ContourType } from "./ContourType";
import { StressType } from "./StressType";

export interface Inflection {
  phraseSlope?: number;
  neutralLevel?: number;
  finalContour?: number[] | ContourType;
  emphasisContour?: number[] | ContourType;
  pitchRamp?: number;
  pitchAccel?: number;
  pitchJerk?: number;
  volumeRamp?: number;
  finalDilation?: number;
}

export interface Intonation extends Partial<Record<StressType, Inflection>> {
  phrasePitchMaxOffset?: number;
  phrasePitchIncrement?: number;
  downdriftIncrement?: number;
  syllableFluctuation?: number;
  stressLevelSemitones?: number;
}
