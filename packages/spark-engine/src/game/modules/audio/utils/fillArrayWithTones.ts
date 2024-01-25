import { Synth } from "../specs/Synth";
import { Tone } from "../types/Tone";
import { fillArrayWithTone } from "./fillArrayWithTone";

export const fillArrayWithTones = (
  tones: readonly Tone[],
  synth: Synth,
  sampleRate: number,
  soundBuffer: Float32Array,
  volumeBuffer?: Float32Array,
  pitchBuffer?: Float32Array,
  pitchRange?: [number, number]
): void => {
  tones.forEach((tone) => {
    fillArrayWithTone(
      tone,
      synth,
      sampleRate,
      soundBuffer,
      volumeBuffer,
      pitchBuffer,
      pitchRange
    );
  });
};
