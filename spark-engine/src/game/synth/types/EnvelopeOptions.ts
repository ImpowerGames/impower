import { CurveType } from "../../core/types/CurveType";

export interface EnvelopeOptions {
  attack?: number;
  attackCurve?: CurveType;
  release?: number;
  releaseCurve?: CurveType;
}
