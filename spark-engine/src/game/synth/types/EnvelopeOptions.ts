import { CurveType } from "./CurveType";

export interface EnvelopeOptions {
  attack?: number;
  attackCurve?: CurveType;
  release?: number;
  releaseCurve?: CurveType;
}
