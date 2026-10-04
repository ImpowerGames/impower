import type { SparkdownNodeName } from "../types/SparkdownNodeName";
import { explicitRuleNames } from "./explicitRuleNames";

/**
 * A constant set of grammar node names. The argument is typed with the
 * union, so a name the grammar cannot produce is a compile error, while the
 * set also includes each listed rule's bounded narrative counterpart. It
 * holds `string` so `has` accepts a bare lezer node's `name`. Context-specific
 * identity checks should use an explicit Set instead of this family helper.
 */
export const nodeNameSet = (names: SparkdownNodeName[]): Set<string> =>
  new Set<string>(names.flatMap(explicitRuleNames));
