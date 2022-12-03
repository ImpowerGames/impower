import { EaseType } from "../../core/types/EaseType";
import { ContourType } from "./ContourType";
import { StressType } from "./StressType";

export interface Inflection {
  phraseSlope?: number;
  neutralLevel?: number;
  finalContour?: number[] | ContourType;
  emphasisContour?: number[] | ContourType;
  pitchBend?: number;
  pitchEase?: EaseType;
  volumeBend?: number;
  volumeEase?: EaseType;
  dilation?: number;
}

export interface Intonation extends Partial<Record<StressType, Inflection>> {
  voiceTone?: string;
  voiceVolume?: number;
  phrasePitchMaxOffset?: number;
  phrasePitchIncrement?: number;
  downdriftIncrement?: number;
  stressLevelSemitones?: number;
}
