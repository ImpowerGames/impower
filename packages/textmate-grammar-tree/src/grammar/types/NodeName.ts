import type { NodeID } from "../../core/enums/NodeID";

export type RuleName<T extends string> =
  | T
  | `${T}_begin`
  | `${T}_content`
  | `${T}_end`;

export type ErrorNodeName = "ERROR_UNRECOGNIZED" | "ERROR_INCOMPLETE";

export type NodeName<T extends string> =
  | keyof typeof NodeID
  | ErrorNodeName
  | RuleName<T>;
