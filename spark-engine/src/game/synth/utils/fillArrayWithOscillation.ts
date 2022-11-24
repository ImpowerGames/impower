import { OSCILLATORS } from "../constants/OSCILLATORS";
import { Hertz } from "../types/Hertz";
import { OscillatorType } from "../types/OscillatorType";

export const fillArrayWithOscillation = (
  buffer: Float32Array,
  startIndex: number,
  endIndex: number,
  sampleRate: number,
  frequency: Hertz | Float32Array,
  velocity: number,
  type: OscillatorType
): void => {
  for (let i = startIndex; i < endIndex; i += 1) {
    const hertz =
      (typeof frequency === "number" ? frequency : frequency[i]) || 0;
    const v = (i * hertz) / sampleRate;
    const oscillator = OSCILLATORS?.[type];
    if (oscillator) {
      buffer[i] = buffer[i] || 0;
      buffer[i] += velocity * oscillator(v);
    }
  }
};
