import { CurveType } from "../../core/types/CurveType";
import { ContourType } from "./ContourType";
import { StressType } from "./StressType";

export interface Intonation extends Partial<Record<StressType, ContourType>> {
  velocityCurve?: CurveType;
  pitchCurve?: CurveType;
  phrasePitchIncrement?: number;
  italicizedPitchIncrement?: number;
  underlinedPitchIncrement?: number;
  boldedPitchIncrement?: number;
  capitalizedPitchIncrement?: number;
}
