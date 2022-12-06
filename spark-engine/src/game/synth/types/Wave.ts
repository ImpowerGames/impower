import { EaseType } from "../../core/types/EaseType";
import { Harmonic } from "./Harmonic";

export interface Wave {
  /** harmonics that are merged with additive synthesis */
  harmonics: Harmonic[];

  /** volume relative to other waves in this tone */
  amplitude?: number;

  /** amount to bend volume  */
  volumeBend?: number;
  /** curve used to bend volume */
  volumeEase?: EaseType;
}
