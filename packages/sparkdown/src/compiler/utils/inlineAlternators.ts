import type { SyntaxNode } from "@lezer/common";
import type { SparkdownNodeName } from "../types/SparkdownNodeName";
import { nodeNameSet } from "./nodeNameSet";

// Alternator forms whose ARM CONTENT is *display text* (not a Luau
// expression). These carry typing-pacing significance: whitespace
// between/around the `|` separators is part of the rendered output,
// so the formatter must leave it alone.
const PRESERVE_WHITESPACE_ALTERNATOR_NAME_LIST: SparkdownNodeName[] = [
  "LuauSparkdownInlineGluedSequentialAlternatorBlock",
  "LuauSparkdownInlineGluedConditionalAlternatorBlock",
  "LuauSparkdownSingleLineSequentialAlternatorBlock",
  "LuauSparkdownSingleLineConditionalAlternatorBlock",
];
export const PRESERVE_WHITESPACE_ALTERNATOR_NAMES = nodeNameSet(
  PRESERVE_WHITESPACE_ALTERNATOR_NAME_LIST,
);

// Any inline alternator form — these all live on a single line and
// should be tight (no `keyword (paren)` separation). Includes both
// the display-text variants above AND the Luau-expression variants
// (`{plural(n)|one="is"|other="are"}`).
export const ALL_INLINE_ALTERNATOR_NAMES = nodeNameSet([
  ...PRESERVE_WHITESPACE_ALTERNATOR_NAME_LIST,
  "LuauSequentialAlternatorBlock",
  "LuauConditionalAlternatorBlock",
]);

/**
 * Whether `node`, or an ancestor of it, is one of the alternator forms in
 * `names` written on one line.
 */
export function isInsideOneLineAlternator(
  node: SyntaxNode,
  read: (from: number, to: number) => string,
  names: Set<string>,
): boolean {
  for (let ancestor: SyntaxNode | null = node; ancestor; ancestor = ancestor.parent) {
    if (!names.has(ancestor.name)) continue;
    // The shared rule names cover BOTH the single-line inline form
    // and the multi-line block form (e.g. `return ( chain | ... end )`).
    // Only the single-line form is "inline" for formatter purposes.
    const span = read(ancestor.from, ancestor.to);
    if (span.includes("\n")) continue;
    return true;
  }
  return false;
}
