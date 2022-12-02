import { CURVES } from "../constants/CURVES";
import { CurveType } from "../types/CurveType";

export const isCurve = (obj: unknown): obj is CurveType => {
  if (typeof obj !== "string") {
    return false;
  }
  return CURVES.includes(obj as CurveType);
};
