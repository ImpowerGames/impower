import { EASE } from "../../core/constants/EASE";
import { CurveType } from "../../core/types/CurveType";
import { EaseType } from "../../core/types/EaseType";

export const easeOutArray = (
  buffer: Float32Array,
  endIndex: number,
  sampleRate: number,
  curveType: CurveType,
  curveDurationInSeconds: number
): void => {
  const easeLength = Math.floor(curveDurationInSeconds * sampleRate);
  for (let i = 0; i < easeLength; i += 1) {
    const progress = i / easeLength;
    const easeType: EaseType =
      curveType === "linear" ? curveType : `${curveType}Out`;
    const ease = EASE[easeType];
    if (ease) {
      const multiplier = ease(progress);
      const index = endIndex - i;
      buffer[index] *= multiplier;
    }
  }
};
