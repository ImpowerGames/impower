import type { SyntaxNode } from "@lezer/common";
import { explicitRuleNames } from "./explicitRuleNames";

// Whether a structural word (`queue`, `cycle`, `chain`, `shuffle`, `match`,
// `plural`) in Luau code opens an alternator or names a value is decided
// here, once, from the tree (I-1310). The grammar opens a candidate at the
// word (one of these rules) and its arms (`LuauAlternatorArms`) at a `|` at
// the word's own level. A `|` there is never valid Luau, which has `|` only
// in a type, and the grammar reads a type, a string, a comment and a bracket
// whole, so a candidate that holds arms is an alternator and one that holds
// none is Luau whatever the scope: `match(1)` is a call of `match`. The
// converter, the lowerers, the annotators and the lints all ask this.

/** The rules a structural word opens in Luau code, each an alternator only when it holds its arms. */
export const ALTERNATOR_CANDIDATES: ReadonlySet<string> = new Set(
  [
    "LuauConditionalAlternatorBlock",
    "LuauSequentialAlternatorBlock",
    "LuauConditionalAlternatorStatement",
    "LuauSequentialAlternatorStatement",
  ].flatMap(explicitRuleNames),
);

const ARMS: ReadonlySet<string> = new Set(
  explicitRuleNames("LuauAlternatorArms"),
);

/** A candidate's arms, or null when it holds none. */
export function alternatorArms(node: SyntaxNode): SyntaxNode | null {
  const content = node.getChild(`${node.name}_content`);
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (ARMS.has(child.name)) return child;
  }
  return null;
}

/**
 * Whether a node opens an alternator: a candidate that holds its arms, or
 * any other node (a story alternator, which its word always opens).
 */
export function opensAlternator(node: SyntaxNode): boolean {
  return !ALTERNATOR_CANDIDATES.has(node.name) || alternatorArms(node) !== null;
}
