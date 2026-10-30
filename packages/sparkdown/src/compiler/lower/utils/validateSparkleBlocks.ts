import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../runtime/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import { findChildByName } from "../../utils/findChildByName";
import type { LowerContext } from "../context";
import { sparkleBlockHasElement } from "./sparkleBlockEntries";
import { joinSparkleContinuations } from "./sparkleContinuations";
import { blockIsClosed, blockOpenBrace } from "./structBodyEntries";
import { lineTextSpan, makeSource } from "./validateDefineStructure";

export const UNCLOSED_SPARKLE_BLOCK =
  "This block is missing its closing `}`. Without it, every line up to the next line that starts with `end`, `else`, `elseif` or `case`, the next `scene` or `branch`, or the end of the file is read as part of this block.";

export const STRAY_SPARKLE_CONTINUATION =
  "There is no element for this line to continue. A line that starts with `.`, `#`, `@` or a quote adds to the element just before it, and a property, an `if`, `for` or `match` block, or the element's `{ … }` block ends that element.";

const CONTROLS: Readonly<Record<string, string>> = {
  LuauSparkleBlockIf: "`if` block",
  LuauSparkleBlockFor: "`for` loop",
  LuauSparkleBlockMatch: "`match` block",
};

function missingEndMessage(label: string): string {
  return `This ${label} is missing its closing \`end\` keyword. Without it, the lines below it are read as part of this ${label}, up to the \`}\` of the block around it, the next \`scene\` or \`branch\`, or the end of the file.`;
}

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
  const joins = joinSparkleContinuations(contentNode);
  for (const stray of joins.stray) {
    const line = lineTextSpan(stray.from, stray.to, ctx);
    if (line) report(STRAY_SPARKLE_CONTINUATION, line.from, line.to);
  }
  const walk = (node: SyntaxNode) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === "LuauSparkleElementBlock") {
        const open = blockOpenBrace(child);
        const from = open?.from ?? child.from;
        const to = open?.to ?? child.from + 1;
        if (!sparkleBlockHasElement(child) && !joins.joined.has(child.from)) {
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
