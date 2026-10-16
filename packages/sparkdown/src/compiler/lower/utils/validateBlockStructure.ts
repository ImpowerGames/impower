import type { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../runtime/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import type { LowerContext } from "../context";
import { findChildByName } from "./alternatorArms";
import { lineTextSpan, makeSource } from "./validateDefineStructure";

// The structure errors of the declaration blocks that share the define's
// shape, `KEYWORD NAME … with` ending at `end` (`style`, `layout`, `screen`,
// `component`, `animation`, `theme` and `morph`), none of which is a parse
// error:
//
//   - A header the grammar stops reading on its own line, with no `end`, cuts
//     the block off there: `style s:`, `layout main with junk`, a dotted
//     name, or a name the grammar cannot read at all (`style 2s with` stops
//     after `style`). The rest of the line and the body below it parse as
//     top-level lines, where the properties are dropped and the block's `end`
//     closes nothing. That shape is reported on the readable part of the
//     header.
//   - A body line the grammar cannot read stops the block the same way,
//     below its header: in a layout, an `else` left outside its `for` by a
//     `}` typed inside the loop. The lines from there to the block's `end`
//     parse as top-level lines, so the block is reported as missing its
//     `end`, on its header line.
//   - Otherwise the grammar ends the block at its `end` keyword or, failing
//     that, at the next `scene` / `branch` beat or the end of the document,
//     so a missing `end` makes the block swallow every top-level line up to
//     that point (a `store x = 1` below it is read as a body line). A block
//     whose `_end` holds no `end` keyword is reported on its header line.
//
// As in `validateDefineStructure`, the checks read only the block's own
// node, so they run in the lowerer and are rebuilt with the block on every
// edit that changes them. Past the header-line check, a block without a
// readable name is left to its lowerer, which drops it.

const HEADER_FORMS: Readonly<Partial<Record<SparkdownNodeName, string>>> = {
  LuauStyle: "`style NAME [as PARENT] with`",
  LuauLayout: "`layout NAME [as PARENT] [in SCREEN] with`",
  LuauScreen: "`screen NAME with`",
  LuauComponent: "`component NAME[(PARAMETERS)] [as PARENT] with`",
  LuauAnimation: "`animation NAME [as PARENT] with`",
  LuauTheme: "`theme NAME [as PARENT] with`",
  LuauMorph: "`morph NAME [as PARENT] with`",
};

// A block's `_end`, each named literally so the grammar node-name check sees
// every name.
function blockEnd(node: GrammarSyntaxNode<SparkdownNodeName>) {
  switch (node.name) {
    case "LuauStyle":
      return findChildByName(node, "LuauStyle_end");
    case "LuauLayout":
      return findChildByName(node, "LuauLayout_end");
    case "LuauScreen":
      return findChildByName(node, "LuauScreen_end");
    case "LuauComponent":
      return findChildByName(node, "LuauComponent_end");
    case "LuauAnimation":
      return findChildByName(node, "LuauAnimation_end");
    case "LuauTheme":
      return findChildByName(node, "LuauTheme_end");
    case "LuauMorph":
      return findChildByName(node, "LuauMorph_end");
    default:
      return null;
  }
}

/** The missing-`end` and unreadable-header errors of a `style`, `layout`,
 *  `screen`, `component`, `animation`, `theme` or `morph` block. */
export function validateBlockStructure(
  node: GrammarSyntaxNode<SparkdownNodeName>,
  ctx: LowerContext,
  keyword: string,
): InkDiagnostic[] {
  const form = HEADER_FORMS[node.name];
  if (!form) return [];
  const headerLine = lineTextSpan(node.from, node.to, ctx);
  if (!headerLine) return [];
  const endNode = blockEnd(node);
  if (endNode && getDescendent("LuauEndKeyword", endNode)) return [];
  const error = (message: string): InkDiagnostic => ({
    message,
    severity: ErrorType.Error,
    source: makeSource(headerLine.from, headerLine.to, ctx),
  });
  const stopped = !endNode && !!findChildByName(node, "ERROR_INCOMPLETE");
  if (stopped && ctx.lineNumber(node.to) === ctx.lineNumber(headerLine.from)) {
    return [
      error(
        getDescendent("LuauWithKeyword", node)
          ? `This ${keyword} cannot be read past \`${headerLine.text}\`. Its body goes on the lines below the header, and it closes with \`end\`.`
          : `This ${keyword} header cannot be read past \`${headerLine.text}\`. A ${keyword} header is ${form}, with names that use only A–Z, a–z, 0–9 and \`_\` and start with a letter or \`_\`; its body goes on the lines below it, and it closes with \`end\`.`,
      ),
    ];
  }
  if (!getDescendent("LuauDefineName", node)) return [];
  if (stopped) {
    return [
      error(
        `This ${keyword} is missing its closing \`end\` keyword: it stops at a line its body cannot read, and the lines from there on are read outside the ${keyword}.`,
      ),
    ];
  }
  return [
    error(
      `This ${keyword} is missing its closing \`end\` keyword. Without it, every line up to the next \`scene\`, \`branch\` or the end of the file is read as part of this ${keyword}.`,
    ),
  ];
}
