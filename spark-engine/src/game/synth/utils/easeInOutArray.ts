import { EaseType } from "../types/EaseType";
import { easeInArray } from "./easeInArray";
import { easeOutArray } from "./easeOutArray";

export const easeInOutArray = (
  buffer: Float32Array,
  startIndex: number,
  endIndex: number,
  sampleRate: number,
  easeType: EaseType,
  easeDurationInSeconds: number
) => {
  easeInArray(buffer, startIndex, sampleRate, easeType, easeDurationInSeconds);
  easeOutArray(buffer, endIndex, sampleRate, easeType, easeDurationInSeconds);
};
