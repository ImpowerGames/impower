import { CurveType } from "../../core/types/CurveType";
import { easeInArray } from "./easeInArray";
import { easeOutArray } from "./easeOutArray";

export const easeInOutArray = (
  buffer: Float32Array,
  startIndex: number,
  endIndex: number,
  sampleRate: number,
  curveType: CurveType,
  curveDurationInSeconds: number
) => {
  easeInArray(
    buffer,
    startIndex,
    sampleRate,
    curveType,
    curveDurationInSeconds
  );
  easeOutArray(buffer, endIndex, sampleRate, curveType, curveDurationInSeconds);
};
