import { PagePosition } from "./PagePosition";

export interface LineOptions {
  level?: number;
  scene?: string | number;
  sceneBold?: boolean;
  position?: PagePosition;
  repeatAfterSplit?: boolean;
  canSplitAfter?: number;
  source?: number[];
}
