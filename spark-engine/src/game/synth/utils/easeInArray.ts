import { EASE } from "../../core/constants/EASE";
import { CurveType } from "../../core/types/CurveType";
import { EaseType } from "../../core/types/EaseType";

export const easeInArray = (
  buffer: Float32Array,
  startIndex: number,
  curveType: CurveType = "sine",
  easeLength: number = 0
): void => {
  for (let i = 0; i < easeLength; i += 1) {
    const progress = i / easeLength;
    const easeType: EaseType =
      curveType === "linear" ? curveType : `${curveType}InOut`;
    const ease = EASE[easeType];
    if (ease) {
      const multiplier = ease(progress);
      const index = startIndex + i;
      buffer[index] *= multiplier;
    }
  }
};
