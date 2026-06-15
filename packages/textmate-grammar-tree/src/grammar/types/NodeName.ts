import type { NodeID } from "../../core/enums/NodeID";

export type RuleName<T extends string> =
  | T
  | `${T}_begin`
  | `${T}_content`
  | `${T}_end`;

/**
 * Capture-index node names (`Foo_begin_c2`, `Foo_c3`, etc.) are
 * intentionally **excluded** from the `NodeName` union — they're
 * parser-implementation-detail names that shift whenever the grammar's
 * begin/end/match regex gains or loses a capture group. Referencing
 * them from a lowerer is a footgun (see GRAMMAR.md §6.4); leaving the
 * type narrow turns any literal reference like
 * `getDescendent("Foo_begin_c2", ...)` into a TypeScript error.
 *
 * If a capture is semantically important, give it a proper named rule
 * wrapper (e.g. `match: (.+)`) and address the wrapper by name instead.
 */
export type NodeName<T extends string> =
  | keyof typeof NodeID
  | RuleName<T>;
