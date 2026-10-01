import { type SyntaxNode } from "@lezer/common";
import { findChildByName } from "../../utils/findChildByName";
import { nodeNameSet } from "../../utils/nodeNameSet";

// The entries of a brace block in a `layout` or `component` body, as the
// grammar reads them (`LuauSparkleBlockEntries`). Both readers walk them: the
// layout tree builder (`lowerSparkleBody`) and the static struct reader
// (`readStructBodyEntries`).
//
//   column.panel #child-gap=8 {        LuauSparkleElement
//     text.title "Inventory"             LuauSparkleElement
//     for item in bag do                 LuauSparkleBlockFor
//       row.item { text "{item}" }         LuauSparkleElement
//     end
//     color = white                      LuauStructBlockProperty
//   }

/** The nodes that are an entry of a block. */
const ENTRY_NAMES = nodeNameSet([
  "LuauSparkleElement",
  "LuauStructBlockProperty",
  "LuauSparkleBlockIf",
  "LuauSparkleBlockFor",
  "LuauSparkleBlockMatch",
  // A block with no element before it.
  "LuauSparkleElementBlock",
]);

/** The branches after a control block's first one, which their control
 *  block reads on its own. */
const CLAUSE_NAMES = nodeNameSet([
  "LuauSparkleBlockElseif",
  "LuauSparkleBlockElse",
  "LuauSparkleBlockCase",
]);

/** The entries directly inside `container` (a block line, a block's or a
 *  branch's content), in source order. */
export function sparkleBlockEntries(container: SyntaxNode): SyntaxNode[] {
  const entries: SyntaxNode[] = [];
  const walk = (node: SyntaxNode) => {
    let child = node.firstChild;
    while (child) {
      if (ENTRY_NAMES.has(child.name)) {
        entries.push(child);
      } else if (!CLAUSE_NAMES.has(child.name)) {
        walk(child);
      }
      child = child.nextSibling;
    }
  };
  walk(container);
  return entries;
}

export interface SparkleElementParts {
  /** The element's name (`BuiltinComponentName` or `LuauSparkleElementName`). */
  name: SyntaxNode | null;
  /** A component call's `LuauSparkleCallArguments`. */
  args: SyntaxNode | null;
  /** The rest of the element's line: its classes, attributes, content and
   *  comments. */
  head: SyntaxNode | null;
  /** The element's `{ … }` (`LuauSparkleElementBlock`). */
  block: SyntaxNode | null;
}

const ELEMENT_NAMES = nodeNameSet([
  "BuiltinComponentName",
  "LuauSparkleElementName",
]);

/** The parts of a `LuauSparkleElement`. Its begin holds three captures in
 *  order: the name, a call's arguments and the head. */
export function sparkleElementParts(element: SyntaxNode): SparkleElementParts {
  const begin = findChildByName(element, "LuauSparkleElement_begin");
  const nameCapture = begin?.firstChild ?? null;
  const name = nameCapture?.firstChild ?? null;
  const args = begin ? firstNamed(begin, CALL_ARGUMENTS) : null;
  // The head is the last capture, which starts where the name and the
  // arguments end; a begin with no such capture has no head.
  const last = begin?.lastChild ?? null;
  const headFrom = args?.to ?? nameCapture?.to ?? 0;
  const head =
    last && last !== nameCapture && last.from >= headFrom ? last : null;
  const content = findChildByName(element, "LuauSparkleElement_content");
  return {
    name: name && ELEMENT_NAMES.has(name.name) ? name : null,
    args,
    head,
    block: content ? findChildByName(content, "LuauSparkleElementBlock") : null,
  };
}

const CALL_ARGUMENTS = nodeNameSet(["LuauSparkleCallArguments"]);

/** DFS in-order: the first descendant whose name is in `names`. */
function firstNamed(node: SyntaxNode, names: Set<string>): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (names.has(child.name)) return child;
    const found = firstNamed(child, names);
    if (found) return found;
  }
  return null;
}

/** Everything between a block's braces. */
export function sparkleBlockContent(block: SyntaxNode): SyntaxNode | null {
  return findChildByName(block, "LuauSparkleElementBlock_content");
}

/** Whether a block is its element's block: the first block directly inside an
 *  element. A block on its own has no element to hold its entries, and a
 *  second block after an element's block (`row { a } { b }`) is not read. */
export function sparkleBlockHasElement(block: SyntaxNode): boolean {
  if (block.parent?.name !== "LuauSparkleElement_content") return false;
  for (let prev = block.prevSibling; prev; prev = prev.prevSibling) {
    if (prev.name === "LuauSparkleElementBlock") return false;
  }
  return true;
}

/** A branch of a brace control block: its `_content`, and how many levels
 *  below the control block the indented form writes its lines. */
export interface SparkleControlBranch {
  content: SyntaxNode;
  depth: number;
}

/** The branches of a brace control block (`if`, `elseif`, `else`, `for`,
 *  `case`), in source order. The first branch's content also holds its
 *  condition and its later clauses, which the entry walk skips. A `match` has
 *  no branch of its own: what stands before its first `case` is read by no
 *  one, as in the indented form, where the arms are one level below the
 *  `match` and their lines one level below the arms. */
export function sparkleControlBranches(
  control: SyntaxNode,
): SparkleControlBranch[] {
  const out: SparkleControlBranch[] = [];
  const depth = control.name === "LuauSparkleBlockMatch" ? 2 : 1;
  const visit = (node: SyntaxNode) => {
    const content = braceControlContent(node);
    if (!content) return;
    if (node.name !== "LuauSparkleBlockMatch") out.push({ content, depth });
    let child = content.firstChild;
    while (child) {
      if (CLAUSE_NAMES.has(child.name)) visit(child);
      child = child.nextSibling;
    }
  };
  visit(control);
  return out;
}

/** The `_content` of a brace control block or clause, each named literally so
 *  the grammar node-name check sees every name. */
export function braceControlContent(node: SyntaxNode): SyntaxNode | null {
  switch (node.name) {
    case "LuauSparkleBlockIf":
      return findChildByName(node, "LuauSparkleBlockIf_content");
    case "LuauSparkleBlockElseif":
      return findChildByName(node, "LuauSparkleBlockElseif_content");
    case "LuauSparkleBlockElse":
      return findChildByName(node, "LuauSparkleBlockElse_content");
    case "LuauSparkleBlockFor":
      return findChildByName(node, "LuauSparkleBlockFor_content");
    case "LuauSparkleBlockMatch":
      return findChildByName(node, "LuauSparkleBlockMatch_content");
    case "LuauSparkleBlockCase":
      return findChildByName(node, "LuauSparkleBlockCase_content");
    default:
      return null;
  }
}
