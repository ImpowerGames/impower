import { EASE } from "../../core/constants/EASE";
import { interpolate } from "../../core/utils/interpolate";
import { convertNoteToHertz } from "./convertNoteToHertz";
import { TimedTone } from "./getTimedTones";
import { transpose } from "./transpose";

export const fillArrayWithPitches = (
  buffer: Float32Array,
  timedTones: readonly TimedTone[],
  waveIndex = 0
): { min: number; max: number } => {
  const result = { min: Number.MAX_SAFE_INTEGER, max: 0 };
  // Zero out the buffer
  for (let i = 0; i < buffer.length; i += 1) {
    buffer[i] = 0;
  }
  timedTones.forEach((tone) => {
    const { startIndex, endIndex, waves } = tone;
    for (let i = startIndex; i < endIndex; i += 1) {
      const localIndex = i - startIndex;
      const length = endIndex - startIndex;
      const progress = localIndex / length;
      const wave = waves?.[waveIndex];
      const note = wave?.hertz;
      const pitchBend = wave?.pitchBend;
      const pitchEase = wave?.pitchEase;
      const hertz = convertNoteToHertz(note);
      const targetHertz = transpose(hertz, pitchBend || 0);
      const easedHertz = interpolate(
        progress,
        hertz,
        targetHertz,
        EASE[pitchEase || "linear"]
      );
      buffer[i] = easedHertz;
      if (easedHertz > result.max) {
        result.max = easedHertz;
      }
      if (easedHertz < result.min) {
        result.min = easedHertz;
      }
    }
  });
  return result;
};
