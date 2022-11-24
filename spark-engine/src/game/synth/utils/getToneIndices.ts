import { Tone } from "../types/Tone";

export const getToneIndices = (
  tone: Tone,
  sampleRate: number
): [number, number] => {
  const time = tone.time || 0;
  const duration = tone.duration || 0;
  const startIndex = Math.floor(time * sampleRate);
  const endIndex = Math.floor((time + duration) * sampleRate);
  return [startIndex, endIndex];
};
