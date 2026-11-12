import type { Tree } from "@lezer/common";

export interface IReusedRecords {
  records?: Int32Array;
  readonly length: number;
  tree?: Tree;
}
