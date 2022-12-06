import { EASE, interpolate } from "../../core";
import { EaseType } from "../../core/types/EaseType";
import { OSCILLATORS } from "../constants/OSCILLATORS";
import { Hertz } from "../types/Hertz";
import { OscillatorType } from "../types/OscillatorType";
import { getBendProgress } from "./getBendProgress";
import { transpose } from "./transpose";

export const fillArrayWithOscillation = (
  buffer: Float32Array,
  startIndex: number,
  endIndex: number,
  sampleRate: number,
  hertz: Hertz,
  pitchBend: number | undefined,
  pitchEase: EaseType | undefined,
  velocity: number = 1,
  type: OscillatorType = "sine"
): void => {
  for (let i = startIndex; i < endIndex; i += 1) {
    const localIndex = i - startIndex;
    const progress = getBendProgress(i, startIndex, endIndex);
    const targetHertz = transpose(hertz, pitchBend || 0);
    const easedHertz = interpolate(
      progress,
      hertz,
      targetHertz,
      EASE[pitchEase || "none"]
    );
    const angle = (localIndex / sampleRate) * easedHertz;
    const oscillator = OSCILLATORS?.[type];
    if (oscillator) {
      buffer[i] += velocity * oscillator(angle);
    }
  }
};
