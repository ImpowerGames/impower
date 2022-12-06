import { EASE, interpolate } from "../../core";
import { EaseType } from "../../core/types/EaseType";
import { getBendProgress } from "./getBendProgress";

export const adjustArrayWithVolumeBend = (
  buffer: Float32Array,
  startIndex: number,
  endIndex: number,
  volumeBend: number | undefined,
  volumeEase: EaseType | undefined
): void => {
  for (let i = startIndex; i < endIndex; i += 1) {
    const progress = getBendProgress(i, startIndex, endIndex);
    const targetVolume = 1 * (volumeBend || 1);
    const easedVolume = interpolate(
      progress,
      1,
      targetVolume,
      EASE[volumeEase || "none"]
    );
    buffer[i] *= easedVolume;
  }
};
