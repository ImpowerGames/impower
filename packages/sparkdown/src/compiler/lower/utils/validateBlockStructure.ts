import type { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../runtime/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import type { LowerContext } from "../context";
import { findChildByName } from "./alternatorArms";
import { lineTextSpan, makeSource } from "./validateDefineStructure";

const HEADER_FORMS: Readonly<Partial<Record<SparkdownNodeName, string>>> = {
  LuauStyle: "`style NAME [as PARENT] with`",
  LuauLayout: "`layout NAME [as PARENT] [in SCREEN] with`",
  LuauScreen: "`screen NAME with`",
  LuauComponent: "`component NAME[(PARAMETERS)] [as PARENT] with`",
  LuauAnimation: "`animation NAME [as PARENT] with`",
  LuauTheme: "`theme NAME [as PARENT] with`",
  LuauMorph: "`morph NAME [as PARENT] with`",
};

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
