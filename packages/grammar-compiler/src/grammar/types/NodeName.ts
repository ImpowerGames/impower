import type { NodeID } from "../../core/enums/NodeID";

export type RuleName<T extends string> = T | `${T}_begin` | `${T}_end`;

export type CaptureName<T extends string> = `${T}-c${number}`;

export type NodeName<T extends string> =
  | keyof typeof NodeID
  | RuleName<T>
  | CaptureName<RuleName<T>>;
