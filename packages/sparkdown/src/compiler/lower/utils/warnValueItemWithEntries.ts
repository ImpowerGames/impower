import { type SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../inkjs/engine/Error";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { structArrayItemInlineEntry } from "../../utils/structArrayItemInlineEntry";
import type { LowerContext } from "../context";

// The value nodes a `- value` item's text lowers from.
const FIELD_VALUE_NAMES = nodeNameSet([
  "StringFieldValueInterpolated",
  "StringFieldValue",
  "NumericFieldValue",
  "BooleanFieldValue",
  "StylingValue",
  "UnquotedStringFieldValue",
]);

/**
 * Warn when a list item holds a VALUE on its dash line and entries beneath it.
 * A value and a set of entries are two different things for one item to be,
 * and nothing can merge them, so the item becomes an object and the value goes
 * nowhere. Saying so beats letting the authored text disappear.
 *
 * A dash line carrying an ENTRY (`- eyes:`, `- offset = 0.4`) is the collapsed
 * list item and is not a contradiction: the entries beneath it are that item's
 * remaining entries. A `- value` item with nothing beneath it is an ordinary
 * scalar element.
 */
export function warnValueItemWithEntries(
  arrayItem: SyntaxNode,
  ctx: LowerContext,
): void {
  if (!ctx.diagnostics) return;
  if (structArrayItemInlineEntry(arrayItem)) return;
  const value = firstDescendant(arrayItem, FIELD_VALUE_NAMES);
  if (!value) return;
  const text = ctx.read(value.from, value.to).trim();
  ctx.diagnostics.push({
    message:
      `This list item already has a value ('${text}'), so the lines indented ` +
      `beneath it replace it instead of adding to it. Write the value's own ` +
      `key on this line ('- key: ' or '- key = ${text}'), or move the value ` +
      `under the dash with the rest of the item's entries.`,
    severity: ErrorType.Warning,
    source: {
      fileName: null,
      filePath: ctx.filePath ?? null,
      startLineNumber: ctx.lineNumber(arrayItem.from) + 1,
      endLineNumber: ctx.lineNumber(arrayItem.to) + 1,
      startCharacterNumber: ctx.characterNumber(arrayItem.from) + 1,
      endCharacterNumber: ctx.characterNumber(arrayItem.to) + 1,
    },
  });
}

/** DFS in-order: first descendant (or self) whose name is in `names`. */
function firstDescendant(
  node: SyntaxNode,
  names: Set<string>,
): SyntaxNode | null {
  if (names.has(node.name)) return node;
  let child = node.firstChild;
  while (child) {
    const found = firstDescendant(child, names);
    if (found) return found;
    child = child.nextSibling;
  }
  return null;
}
