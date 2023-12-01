import { CurveType } from "./CurveType";

export type CurveDirection = "in" | "out" | "in_out";

export type EaseType =
  | "none"
  | "linear"
  | `${Exclude<CurveType, "linear">}_${CurveDirection}`;
