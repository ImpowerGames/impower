import { PagePosition } from "./PagePosition";

export interface LineOptions {
  level?: number;
  scene?: string | number;
  position?: PagePosition;
  repeatAfterSplit?: boolean;
  canSplitAfter?: number;
}
