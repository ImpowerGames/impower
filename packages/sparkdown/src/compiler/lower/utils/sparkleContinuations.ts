import { type SyntaxNode } from "@lezer/common";
import { nodeNameSet } from "../../utils/nodeNameSet";
import {
  sparkleBlockContent,
  sparkleBlockEntries,
  sparkleContinuationBlock,
  sparkleControlBranches,
  sparkleElementParts,
} from "./sparkleBlockEntries";

// The parts of an element in a `layout` or `component` body may go on over
// later lines (#1225):
//
//   button                     the element (an indented line, or an element
//     .fancy                   in a block line or a block)
//     #bg-color=green          continuations (`LuauSparkleElementContinuation`)
//     @click={
//       score = 0
//     }
//   {                          its block, on a line of its own
//     text "Confirm"           (`LuauSparkleElementBlock` with no element
//   }                          before it)
//
// The grammar reads each continuation line, and a block on a line of its
// own, as a node of its own, since no pattern can see the element above it.
// This joins each to the element it continues: the last element before it,
// with only comments, blank lines and other continuations between, that has
// no block yet. A property (a quoted key included), a control block, an
// indented `name:` header or `- item`, a `}` that closes no block, text that
// starts no entry, or an element's block ends the element, and indentation
// plays no part. Both lowerers read an element's joined parts as if written on its
// line, and the validator reports a continuation or block that follows no
// element.

/** What the continuations and own-line blocks of a body join. An element is
 *  keyed by the `from` of its `LuauSparkleElement` node. */
export interface SparkleJoins {
  /** The continuation lines each element takes, in source order. */
  continuations: Map<number, SyntaxNode[]>;
  /** The block each element takes from a later line: a block on a line of
   *  its own, or the block a continuation line ends with. */
  blocks: Map<number, SyntaxNode>;
  /** The `from` of every continuation and own-line block that joins an
   *  element. */
  joined: Set<number>;
  /** The continuation lines that follow no element. */
  stray: SyntaxNode[];
}

// The indented `if`, `for` and `match` blocks and their later branches. Each
// ends the element before it, and each branch is read on its own.
const INDENTED_CONTROL_NAMES = nodeNameSet([
  "LuauSparkleIfBlock",
  "LuauSparkleForLoop",
  "LuauSparkleMatchBlock",
  "LuauSparkleElseifBlock",
  "LuauSparkleElseBlock",
  "LuauSparkleCaseClause",
]);

// Text in a block that starts no entry: an indented form's `name:` header or
// `- ` mark, a `}` that closes no block, or anything else no entry reads. It
// is reported, and it ends the element before it, as any entry other than a
// continuation does.
const INVALID_ENTRY_NAMES = nodeNameSet([
  "LuauStructInvalidHeader",
  "LuauStructBlockItemMark",
  "LuauSparkleBlockUnknown",
  "LuauStructStrayBlockClose",
]);

/** A block's entries, and the invalid text between them, in source order. */
function entryNodes(container: SyntaxNode): SyntaxNode[] {
  return sparkleBlockEntries(container, INVALID_ENTRY_NAMES);
}

interface JoinState {
  /** The key of the element later parts join, while one is open. */
  open: number | null;
}

/** Join every continuation and own-line block in a layout or component body
 *  (its content node) to the element it continues. */
export function joinSparkleContinuations(
  contentNode: SyntaxNode | null,
): SparkleJoins {
  const joins: SparkleJoins = {
    continuations: new Map(),
    blocks: new Map(),
    joined: new Set(),
    stray: [],
  };
  if (!contentNode) return joins;

  const entries = (nodes: SyntaxNode[], state: JoinState) => {
    for (const node of nodes) {
      switch (node.name) {
        case "LuauSparkleElement": {
          const { block } = sparkleElementParts(node);
          if (block) blockEntries(block);
          state.open = block ? null : node.from;
          break;
        }
        case "LuauSparkleElementContinuation": {
          const block = sparkleContinuationBlock(node);
          if (state.open === null) {
            joins.stray.push(node);
          } else {
            const list = joins.continuations.get(state.open) ?? [];
            list.push(node);
            joins.continuations.set(state.open, list);
            joins.joined.add(node.from);
            if (block) joins.blocks.set(state.open, block);
          }
          if (block) {
            blockEntries(block);
            state.open = null;
          }
          break;
        }
        case "LuauSparkleElementBlock":
          if (state.open !== null) {
            joins.blocks.set(state.open, node);
            joins.joined.add(node.from);
          }
          blockEntries(node);
          state.open = null;
          break;
        case "LuauStructBlockProperty":
          state.open = null;
          break;
        default:
          // An `if`, `for` or `match` block: each branch is read on its own.
          // Invalid text has no branches.
          for (const branch of sparkleControlBranches(node)) {
            entries(entryNodes(branch.content), { open: null });
          }
          state.open = null;
      }
    }
  };
  const blockEntries = (block: SyntaxNode) => {
    const content = sparkleBlockContent(block);
    if (content) entries(entryNodes(content), { open: null });
  };

  // The lines of the body, or of an indented control block's branch.
  const lines = (node: SyntaxNode, state: JoinState) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === "LuauSparkleBlockLine") {
        entries(entryNodes(child), state);
      } else if (INDENTED_CONTROL_NAMES.has(child.name)) {
        state.open = null;
        lines(child, { open: null });
      } else {
        lines(child, state);
      }
    }
  };
  lines(contentNode, { open: null });
  return joins;
}
