import { Tone } from "../types/Tone";

export const getNumberOfSamples = (
  tones: Tone[],
  sampleRate: number
): number => {
  let maxMS = 0;
  if (tones) {
    tones.forEach((tone) => {
      const timeMS = (tone.time ?? 0) + (tone.duration ?? 0);
      if (timeMS > maxMS) {
        maxMS = timeMS;
      }
    });
  }
  return sampleRate * maxMS;
};
