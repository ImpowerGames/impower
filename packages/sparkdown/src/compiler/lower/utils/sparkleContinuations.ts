import { type SyntaxNode } from "@lezer/common";
import { nodeNameSet } from "../../utils/nodeNameSet";
import {
  sparkleBlockContent,
  sparkleBlockEntries,
  sparkleContinuationBlock,
  sparkleControlBranches,
  sparkleElementParts,
} from "./sparkleBlockEntries";

export interface SparkleJoins {
  continuations: Map<number, SyntaxNode[]>;
  blocks: Map<number, SyntaxNode>;
  joined: Set<number>;
  stray: SyntaxNode[];
}

const INDENTED_CONTROL_NAMES = nodeNameSet([
  "LuauSparkleIfBlock",
  "LuauSparkleForLoop",
  "LuauSparkleMatchBlock",
  "LuauSparkleElseifBlock",
  "LuauSparkleElseBlock",
  "LuauSparkleCaseClause",
]);

const INVALID_ENTRY_NAMES = nodeNameSet([
  "LuauStructInvalidHeader",
  "LuauStructBlockItemMark",
  "LuauSparkleBlockUnknown",
  "LuauStructStrayBlockClose",
]);

function entryNodes(container: SyntaxNode): SyntaxNode[] {
  return sparkleBlockEntries(container, INVALID_ENTRY_NAMES);
}

interface JoinState {
  open: number | null;
}

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
