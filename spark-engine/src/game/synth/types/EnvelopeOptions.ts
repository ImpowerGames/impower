import { EaseType } from "./EaseType";

export interface EnvelopeOptions {
  attack?: number;
  attackCurve?: EaseType;
  release?: number;
  releaseCurve?: EaseType;
}
