import { INTERPOLATORS } from "../constants/INTERPOLATORS";
import { EaseType } from "../types/EaseType";

export const easeInArray = (
  buffer: Float32Array,
  startIndex: number,
  sampleRate: number,
  easeType: EaseType,
  easeDurationInSeconds: number
): void => {
  const easeLength = Math.floor(easeDurationInSeconds * sampleRate);
  for (let i = 0; i < easeLength; i += 1) {
    const progress = i / easeLength;
    const interpolator = INTERPOLATORS[easeType];
    if (interpolator) {
      const multiplier = interpolator(progress);
      const index = startIndex + i;
      buffer[index] *= multiplier;
    }
  }
};
