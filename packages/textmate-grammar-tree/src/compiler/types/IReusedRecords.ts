import type { Tree } from "@lezer/common";

export interface IReusedRecords {
  readonly records: () => Int32Array;
  readonly length: number;
  tree?: Tree;
  maxBufferLength?: number;
}
