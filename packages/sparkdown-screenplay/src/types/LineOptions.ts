import { PagePosition } from "./PagePosition";
import { PrintedInsert } from "./PrintedInsert";

export interface LineOptions {
  level?: number;
  scene?: string | number;
  sceneBold?: boolean;
  position?: PagePosition;
  repeatAfterSplit?: boolean;
  canSplitAfter?: number;
  source?: number[];
  inserts?: PrintedInsert[];
}
