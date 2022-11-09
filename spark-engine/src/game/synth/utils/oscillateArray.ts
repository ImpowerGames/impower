import { OSCILLATORS } from "../constants/OSCILLATORS";
import { SAMPLE_RATE } from "../constants/SAMPLE_RATE";
import { OscillatorType } from "../types/OscillatorType";

export const oscillateArray = (
  buffer: Float32Array,
  type: OscillatorType,
  frequency: number,
  offset: number,
  duration: number
): void => {
  for (let i = offset; i < offset + duration; i += 1) {
    const time = i / SAMPLE_RATE;
    const angle = frequency * time * Math.PI;
    const oscillator = OSCILLATORS?.[type];
    if (oscillator) {
      buffer[i] = oscillator(angle);
    }
  }
};
