import { RAMPS } from "../constants/RAMPS";
import { CurveType } from "../types/CurveType";

export const rampArray = (
  buffer: Float32Array,
  type: CurveType,
  fadeLength: number,
  fadeDirection: "in" | "out",
  offsetSampleLength = 0,
  durationSampleLength = buffer.length
): void => {
  for (let i = 0; i < fadeLength; i += 1) {
    const index =
      fadeDirection === "in"
        ? offsetSampleLength + i
        : offsetSampleLength + durationSampleLength - 1 - i;
    const percent = i / fadeLength;
    const ramp = RAMPS[type];
    if (ramp) {
      const amp = ramp(percent);
      buffer[index] *= amp;
    }
  }
};
