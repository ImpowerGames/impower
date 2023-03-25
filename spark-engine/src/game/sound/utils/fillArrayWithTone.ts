import { Tone } from "../types/Tone";
import { synthesizeSound } from "./synthesizeSound";

export const fillArrayWithTone = (
  tone: Tone,
  sampleRate: number,
  soundBuffer: Float32Array,
  volumeBuffer?: Float32Array,
  pitchBuffer?: Float32Array,
  pitchRange?: [number, number]
): void => {
  const synth = tone.synth;
  const time = tone.time || 0;
  const duration = tone.duration || 0;
  const volume = tone.velocity;
  const pitch = tone.hertz;
  if (synth && duration) {
    const startIndex = Math.floor(time * sampleRate);
    const endIndex = Math.floor((time + duration) * sampleRate);
    synthesizeSound(
      synth,
      true,
      true,
      sampleRate,
      startIndex,
      endIndex,
      soundBuffer,
      volumeBuffer,
      pitchBuffer,
      pitchRange,
      volume,
      pitch
    );
  }
};
