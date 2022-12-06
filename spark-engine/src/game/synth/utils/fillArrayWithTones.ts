import { Tone } from "../types/Tone";
import { fillArrayWithWaveforms } from "./fillArrayWithWaveforms";
import { getWaveforms, Waveform } from "./getWaveforms";

export const fillArrayWithTones = (
  buffer: Float32Array,
  sampleRate: number,
  tones: readonly Tone[]
): Waveform[] => {
  for (let i = 0; i < buffer.length; i += 1) {
    // Zero out the buffer
    buffer[i] = 0;
  }
  const waveforms = getWaveforms(tones, sampleRate);
  fillArrayWithWaveforms(buffer, sampleRate, waveforms);
  return waveforms;
};
