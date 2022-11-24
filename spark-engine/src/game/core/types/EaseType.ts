import { CurveType } from "./CurveType";

export type CurveDirection = "In" | "Out" | "InOut";

export type EaseType =
  | "none"
  | "linear"
  | `${Exclude<CurveType, "linear">}${CurveDirection}`;
