import type { SparkdownNodeName } from "../types/SparkdownNodeName";

/**
 * A constant set of grammar node names. The argument is typed with the
 * union, so a name the grammar cannot produce is a compile error, while the
 * set itself holds `string` so that `has` accepts the `name` of a bare lezer
 * node, which is typed `string`.
 */
export const nodeNameSet = (names: SparkdownNodeName[]): Set<string> =>
  new Set<string>(names);
