import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../inkjs/engine/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import { findChildByName } from "../../utils/findChildByName";
import type { LowerContext } from "../context";
import { sparkleBlockHasElement } from "./sparkleBlockEntries";
import { blockIsClosed, blockOpenBrace } from "./structBodyEntries";
import { lineTextSpan, makeSource } from "./validateDefineStructure";

// The structure errors of the brace blocks in a `layout` or `component` body:
// a block left without its `}`, a block with no element before it, and an
// `if`, `for` or `match` inside a block left without its `end`.
//
// Each is reported where the mistake shows (the `{`, the control block's
// header line), which can stand before the edit that makes or fixes it: typing
// a `}` in a branch closes the control block around it early. The checks
// therefore run as the declaration is lowered, so the diagnostics are rebuilt
// with the declaration on every edit inside it, as `validateBlockEnds` does
// for Luau blocks.

/** Worded like the missing-`end` message of a define. A layout block left
 *  open ends where a line starts with `end`, `else`, `elseif` or `case`. */
export const UNCLOSED_SPARKLE_BLOCK =
  "This block is missing its closing `}`. Without it, every line up to the next line that starts with `end`, `else`, `elseif` or `case`, the next `scene` or `branch`, or the end of the file is read as part of this block.";

// The control blocks a layout or component block can hold, and what a
// message calls each.
const CONTROLS: Readonly<Record<string, string>> = {
  LuauSparkleBlockIf: "`if` block",
  LuauSparkleBlockFor: "`for` loop",
  LuauSparkleBlockMatch: "`match` block",
};

function missingEndMessage(label: string): string {
  return `This ${label} is missing its closing \`end\` keyword. Without it, the lines below it are read as part of this ${label}, up to the \`}\` of the block around it, the next \`scene\` or \`branch\`, or the end of the file.`;
}

// A control block's `_end`, each named literally so the grammar node-name
// check sees every name.
function controlEnd(node: SyntaxNode): SyntaxNode | null {
  switch (node.name) {
    case "LuauSparkleBlockIf":
      return findChildByName(node, "LuauSparkleBlockIf_end");
    case "LuauSparkleBlockFor":
      return findChildByName(node, "LuauSparkleBlockFor_end");
    case "LuauSparkleBlockMatch":
      return findChildByName(node, "LuauSparkleBlockMatch_end");
    default:
      return null;
  }
}

/** The brace structure errors in a layout or component body. */
export function validateSparkleBlocks(
  contentNode: SyntaxNode | null,
  ctx: LowerContext,
): InkDiagnostic[] {
  const diagnostics: InkDiagnostic[] = [];
  if (!contentNode) return diagnostics;
  const report = (message: string, from: number, to: number) => {
    diagnostics.push({
      message,
      severity: ErrorType.Error,
      source: makeSource(from, to, ctx),
    });
  };
  const walk = (node: SyntaxNode) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === "LuauSparkleElementBlock") {
        const open = blockOpenBrace(child);
        const from = open?.from ?? child.from;
        const to = open?.to ?? child.from + 1;
        if (!sparkleBlockHasElement(child)) {
          report("Invalid syntax", from, to);
        } else if (!blockIsClosed(child)) {
          report(UNCLOSED_SPARKLE_BLOCK, from, to);
        }
      } else {
        const label = CONTROLS[child.name];
        const end = label ? controlEnd(child) : null;
        if (label && (!end || !getDescendent("LuauEndKeyword", end))) {
          const line = lineTextSpan(child.from, child.to, ctx);
          if (line) report(missingEndMessage(label), line.from, line.to);
        }
      }
      walk(child);
    }
  };
  walk(contentNode);
  return diagnostics;
}
