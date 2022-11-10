import { OSCILLATORS } from "../constants/OSCILLATORS";
import { SAMPLE_RATE } from "../constants/SAMPLE_RATE";
import { OscillatorType } from "../types/OscillatorType";

export const oscillateArray = (
  buffer: Float32Array,
  type: OscillatorType,
  frequency: number,
  velocity: number,
  offsetSampleLength = 0,
  durationSampleLength = buffer.length
): void => {
  for (
    let i = offsetSampleLength;
    i < offsetSampleLength + durationSampleLength;
    i += 1
  ) {
    const time = i / SAMPLE_RATE;
    const angle = frequency * time * Math.PI;
    const oscillator = OSCILLATORS?.[type];
    if (oscillator) {
      buffer[i] = velocity * oscillator(angle);
    }
  }
};
