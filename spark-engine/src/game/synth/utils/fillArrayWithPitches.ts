import { EASE } from "../../core/constants/EASE";
import { interpolate } from "../../core/utils/interpolate";
import { convertNoteToHertz } from "./convertNoteToHertz";
import { getBendProgress } from "./getBendProgress";
import { Waveform } from "./getWaveforms";
import { transpose } from "./transpose";

export const fillArrayWithPitches = (
  buffer: Float32Array,
  waveforms: readonly Waveform[],
  harmonicIndex = 0
): { min: number; max: number } => {
  const result = { min: Number.MAX_SAFE_INTEGER, max: 0 };
  // Zero out the buffer
  for (let i = 0; i < buffer.length; i += 1) {
    buffer[i] = 0;
  }
  waveforms.forEach((waveform) => {
    const { waves } = waveform;
    waves.forEach((wave) => {
      const startIndex = wave.startIndex;
      const endIndex = wave.endIndex;
      for (let i = startIndex; i < endIndex; i += 1) {
        const progress = getBendProgress(i, startIndex, endIndex);
        const harmonic = wave.harmonics?.[harmonicIndex];
        const pitchBend = harmonic?.pitchBend;
        const pitchEase = harmonic?.pitchEase;
        const hertz = convertNoteToHertz(harmonic?.note);
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
  });
  return result;
};
