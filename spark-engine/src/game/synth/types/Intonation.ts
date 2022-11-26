import { CurveType } from "../../core/types/CurveType";
import { ContourType } from "./ContourType";
import { StressType } from "./StressType";

export interface Inflection {
  phraseSlope?: number;
  driftContour?: number[] | ContourType;
  finalContour?: number[] | ContourType;
}

export interface Intonation extends Partial<Record<StressType, Inflection>> {
  envelope?: {
    /** attack curve */
    attackCurve?: CurveType;
    /** release curve */
    releaseCurve?: CurveType;
    /** attack time in seconds */
    attackTime?: number;
    /** release time in seconds */
    releaseTime?: number;
  };
  volume?: number;
  pitchCurve?: CurveType;
  phrasePitchOffset?: number;
  syllableFluctuation?: number;
  italicizedPitchOffset?: number;
  underlinedPitchOffset?: number;
  boldedPitchOffset?: number;
  capitalizedPitchOffset?: number;
}
