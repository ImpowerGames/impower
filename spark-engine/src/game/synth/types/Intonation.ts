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
  finalDilation?: number;
}

export interface Intonation extends Partial<Record<StressType, Inflection>> {
  voiceTone?: string;
  voiceEnvelope:
    | [number] // r
    | [number, number] // ar
    | [number, number, number] // adr
    | [number, number, number, number] // ahdr
    | string;
  voiceContour:
    | [EaseType] // r
    | [EaseType, EaseType] // ar
    | [EaseType, EaseType, EaseType] //adr
    | string;
  voiceVolume?: number;
  phrasePitchMaxOffset?: number;
  phrasePitchIncrement?: number;
  downdriftIncrement?: number;
  syllableFluctuation?: number;
  stressLevelSemitones?: number;
}
