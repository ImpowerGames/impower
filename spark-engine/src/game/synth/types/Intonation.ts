import { EaseType } from "../../core/types/EaseType";
import { ContourType } from "./ContourType";
import { StressType } from "./StressType";

export interface Inflection {
  phraseSlope?: number;
  driftContour?: number[] | ContourType;
  finalContour?: number[] | ContourType;
  pitchBend?: number;
  pitchEase?: EaseType;
  volumeBend?: number;
  volumeEase?: EaseType;
}

export interface Intonation extends Partial<Record<StressType, Inflection>> {
  phrasePitchOffset?: number;
  syllableFluctuation?: number;
  italicizedPitchOffset?: number;
  underlinedPitchOffset?: number;
  boldedPitchOffset?: number;
  capitalizedPitchOffset?: number;
  levelSemitones?: number;
}
