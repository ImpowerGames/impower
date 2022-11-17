import { OSCILLATORS } from "../constants/OSCILLATORS";
import { Hertz } from "../types/Hertz";
import { OscillatorType } from "../types/OscillatorType";

export const fillArrayWithOscillation = (
  buffer: Float32Array,
  startIndex: number,
  endIndex: number,
  sampleRate: number,
  frequency: Hertz,
  velocity: number,
  type: OscillatorType
): void => {
  for (let i = startIndex; i < endIndex; i += 1) {
    const v = (i * frequency) / sampleRate;
    const oscillator = OSCILLATORS?.[type];
    if (oscillator) {
      buffer[i] = buffer[i] || 0;
      buffer[i] += velocity * oscillator(v);
    }
  }
};
