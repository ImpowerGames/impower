import type { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType } from "../../../runtime/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import type { LowerContext } from "../context";
import { keywordBraceBody, keywordWithBody } from "../../utils/braceBlocks";
import { findChildByName } from "./alternatorArms";
import { blockIsClosed, blockOpenBrace } from "./structBodyEntries";
import { capitalizedArticle, lineTextSpan, makeSource } from "./validateDefineStructure";

const BRACE_HEADER_FORMS: Readonly<Partial<Record<SparkdownNodeName, string>>> = {
  LuauStyle: "`style NAME [as PARENT] {`",
  LuauLayout: "`layout NAME [in SCREEN] [as PARENT] {`",
  LuauScreen: "`screen NAME {`",
  LuauComponent: "`component NAME[(PARAMETERS)] [as PARENT] {`",
  LuauAnimation: "`animation NAME [as PARENT] {`",
  LuauTheme: "`theme NAME [as PARENT] {`",
  LuauMorph: "`morph NAME [as PARENT] {`",
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

function structBodyInBracesMessage(keyword: string): string {
  return `${capitalizedArticle(keyword)} ${keyword} body goes in braces: \`${keyword} NAME { … }\`.`;
}

export function validateBlockStructure(
  node: GrammarSyntaxNode<SparkdownNodeName>,
  ctx: LowerContext,
  keyword: string,
): InkDiagnostic[] {
  const form = BRACE_HEADER_FORMS[node.name];
  if (!form) return [];
  const headerLine = lineTextSpan(node.from, node.to, ctx);
  if (!headerLine) return [];
  const error = (message: string): InkDiagnostic => ({
    message,
    severity: ErrorType.Error,
    source: makeSource(headerLine.from, headerLine.to, ctx),
  });
  const braceBody = keywordBraceBody(node);
  if (!braceBody) {
    const stopped =
      !blockEnd(node) && !!findChildByName(node, "ERROR_INCOMPLETE");
    if (
      stopped &&
      !keywordWithBody(node) &&
      ctx.lineNumber(node.to) === ctx.lineNumber(headerLine.from)
    ) {
      return [
        error(
          `This ${keyword} header cannot be read past \`${headerLine.text}\`. A ${keyword} header is ${form}, with names that use only A–Z, a–z, 0–9 and \`_\` and start with a letter or \`_\`; its body goes inside the braces.`,
        ),
      ];
    }
    if (!getDescendent("LuauDefineName", node)) return [];
    return [error(structBodyInBracesMessage(keyword))];
  }
  const diagnostics: InkDiagnostic[] = [];
  if (keywordWithBody(node)) {
    diagnostics.push(error(structBodyInBracesMessage(keyword)));
  }
  const open = blockOpenBrace(braceBody);
  if (open && ctx.lineNumber(open.from) !== ctx.lineNumber(headerLine.from)) {
    diagnostics.push({
      message: `${capitalizedArticle(keyword)} ${keyword}'s \`{\` goes at the end of its header line: ${form}.`,
      severity: ErrorType.Error,
      source: makeSource(open.from, open.to, ctx),
    });
  }
  if (blockIsClosed(braceBody)) return diagnostics;
  if (findChildByName(braceBody, "ERROR_INCOMPLETE")) {
    diagnostics.push(
      error(
        `This ${keyword} is missing its closing \`}\`: it stops at a line its body cannot read, and the lines from there on are read outside the ${keyword}.`,
      ),
    );
    return diagnostics;
  }
  const closers =
    braceBody.name === "LuauSparkleBraceBody"
      ? "`end`, `else`, `elseif` or `case`"
      : "`end`";
  diagnostics.push(
    error(
      `This ${keyword} is missing its closing \`}\`. Without it, every line up to the next \`scene\` or \`branch\`, line that starts with ${closers}, or the end of the file is read as part of this ${keyword}.`,
    ),
  );
  return diagnostics;
}
