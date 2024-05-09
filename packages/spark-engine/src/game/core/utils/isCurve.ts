import { CurveType } from "../../modules/ui/types/CurveType";
import { CURVES } from "../constants/CURVES";

export const isCurve = (obj: unknown): obj is CurveType => {
  if (typeof obj !== "string") {
    return false;
  }
  return CURVES.includes(obj as CurveType);
};
