import { EASE, interpolate } from "../../core";
import { EaseType } from "../../core/types/EaseType";
import { OSCILLATORS } from "../constants/OSCILLATORS";
import { Hertz } from "../types/Hertz";
import { OscillatorType } from "../types/OscillatorType";
import { transpose } from "./transpose";

export const fillArrayWithOscillation = (
  buffer: Float32Array,
  startIndex: number,
  endIndex: number,
  sampleRate: number,
  hertz: Hertz,
  pitchBend: number | undefined,
  pitchEase: EaseType | undefined,
  volumeBend: number | undefined,
  volumeEase: EaseType | undefined,
  velocity: number = 1,
  type: OscillatorType = "sine"
): void => {
  for (let i = startIndex; i < endIndex; i += 1) {
    const localIndex = i - startIndex;
    const length = endIndex - startIndex;
    const progress = localIndex / length;
    const targetHertz = transpose(hertz, pitchBend || 0);
    const easedHertz = interpolate(
      progress,
      hertz,
      targetHertz,
      EASE[pitchEase || "none"]
    );
    const targetVolume = velocity * (volumeBend || 1);
    const easedVolume = interpolate(
      progress,
      velocity,
      targetVolume,
      EASE[volumeEase || "none"]
    );
    const angle = (localIndex / sampleRate) * easedHertz;
    const oscillator = OSCILLATORS?.[type];
    if (oscillator) {
      buffer[i] += easedVolume * oscillator(angle);
    }
  }
};
