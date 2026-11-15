import { PagePosition } from "./PagePosition";

export type PrintedRowSide = "above" | "below";

export interface LineOptions {
  level?: number;
  scene?: string | number;
  sceneBold?: boolean;
  position?: PagePosition;
  repeatAfterSplit?: boolean;
  canSplitAfter?: number;
  source?: number[];
  row?: PrintedRowSide;
}
