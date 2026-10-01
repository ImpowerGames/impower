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
  // A line that continues the element above it (#1225).
  "LuauSparkleElementContinuation",
]);

/** The branches after a control block's first one, which their control
 *  block reads on its own. */
const CLAUSE_NAMES = nodeNameSet([
  "LuauSparkleBlockElseif",
  "LuauSparkleBlockElse",
  "LuauSparkleBlockCase",
]);

/** The entries directly inside `container` (a block line, a block's or a
 *  branch's content), in source order, with any node named in `also`. */
export function sparkleBlockEntries(
  container: SyntaxNode,
  also?: ReadonlySet<string>,
): SyntaxNode[] {
  const entries: SyntaxNode[] = [];
  const walk = (node: SyntaxNode) => {
    let child = node.firstChild;
    while (child) {
      if (ENTRY_NAMES.has(child.name) || also?.has(child.name)) {
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
  /** The rest of the element's line after its name and arguments, up to an
   *  event closure its line leaves open: its classes, attributes, content and
   *  comments (a `LuauSparkleElementParts`). */
  head: SyntaxNode | null;
  /** The element's `{ … }` (`LuauSparkleElementBlock`). */
  block: SyntaxNode | null;
  /** Where the element's begin (its name and arguments) ends. */
  beginTo: number;
}

const ELEMENT_NAMES = nodeNameSet([
  "BuiltinComponentName",
  "LuauSparkleElementName",
]);

/** The parts of a `LuauSparkleElement`. Its begin holds two captures in
 *  order, the name and a call's arguments; its head is the run of parts its
 *  content starts with. */
export function sparkleElementParts(element: SyntaxNode): SparkleElementParts {
  const begin = findChildByName(element, "LuauSparkleElement_begin");
  const nameCapture = begin?.firstChild ?? null;
  const name = nameCapture?.firstChild ?? null;
  const args = begin ? firstNamed(begin, CALL_ARGUMENTS) : null;
  const beginTo = begin?.to ?? element.from;
  const content = findChildByName(element, "LuauSparkleElement_content");
  const first = content?.firstChild ?? null;
  const head =
    first?.name === "LuauSparkleElementParts" && first.from === beginTo
      ? first
      : null;
  return {
    name: name && ELEMENT_NAMES.has(name.name) ? name : null,
    args,
    head,
    block: content ? findChildByName(content, "LuauSparkleElementBlock") : null,
    beginTo,
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

/** Whether a block is the first block directly inside an element or a
 *  continuation line. A block on its own has an element only when it follows
 *  one (`joinSparkleContinuations`), and a second block after an element's
 *  block (`row { a } { b }`) is not read. */
export function sparkleBlockHasElement(block: SyntaxNode): boolean {
  const parent = block.parent?.name;
  if (
    parent !== "LuauSparkleElement_content" &&
    parent !== "LuauSparkleElementContinuation_content"
  ) {
    return false;
  }
  for (let prev = block.prevSibling; prev; prev = prev.prevSibling) {
    if (prev.name === "LuauSparkleElementBlock") return false;
  }
  return true;
}

/** The parts after an element's head, and the parts of a continuation line:
 *  runs of parts (`LuauSparkleElementParts`) and event closures that go on
 *  at the next line, in source order. */
const LATER_PART_NAMES = nodeNameSet([
  "LuauSparkleElementParts",
  "LuauSparkleEventClosureAttribute",
]);

/** The nodes that hold the parts of an element (`LuauSparkleElement`) or a
 *  continuation line (`LuauSparkleElementContinuation`), in source order:
 *  its runs of parts (an element's head first) and its event closures, but
 *  not its block. */
export function sparklePartNodes(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  const content =
    node.name === "LuauSparkleElement"
      ? findChildByName(node, "LuauSparkleElement_content")
      : findChildByName(node, "LuauSparkleElementContinuation_content");
  for (let child = content?.firstChild; child; child = child.nextSibling) {
    if (LATER_PART_NAMES.has(child.name)) out.push(child);
  }
  return out;
}

/** The block a continuation line ends with (`"Okay" {`), if any. */
export function sparkleContinuationBlock(
  continuation: SyntaxNode,
): SyntaxNode | null {
  const content = findChildByName(
    continuation,
    "LuauSparkleElementContinuation_content",
  );
  return content ? findChildByName(content, "LuauSparkleElementBlock") : null;
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
