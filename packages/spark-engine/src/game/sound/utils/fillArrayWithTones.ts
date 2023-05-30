import { Tone } from "../types/Tone";
import { fillArrayWithTone } from "./fillArrayWithTone";

export const fillArrayWithTones = (
  tones: readonly Tone[],
  sampleRate: number,
  soundBuffer: Float32Array,
  volumeBuffer?: Float32Array,
  pitchBuffer?: Float32Array,
  pitchRange?: [number, number]
): void => {
  tones.forEach((tone) => {
    fillArrayWithTone(
      tone,
      sampleRate,
      soundBuffer,
      volumeBuffer,
      pitchBuffer,
      pitchRange
    );
  });
};
