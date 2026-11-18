import type { SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../runtime/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import { makeSource } from "./validateDefineStructure";

const BARE_GLUED_SET =
  /(?<=^|[ \t])\.\.[ \t]+(match|plural)[ \t]+([^\s(|][^|\r\n]*?)[ \t]*\|[^\r\n]*?[ \t]\.\.(?=[ \t]|$)/gm;
const GLUE = /(?:^|[ \t])\.\.(?=[ \t]|$)/;
const NOT_STORY_TEXT = /String|Comment|Raw/;

function isStoryTextToken(top: SyntaxNode, at: number, name: string): boolean {
  const token = top.resolveInner(at, 1);
  if (token.name !== name || token.from !== at) return false;
  for (let node: SyntaxNode | null = token.parent; node; node = node.parent) {
    if (NOT_STORY_TEXT.test(node.name)) return false;
  }
  return true;
}

export function validateBareGluedValues(
  top: SyntaxNode,
  ctx: LowerContext,
): InkDiagnostic[] {
  const text = ctx.documentText?.() ?? ctx.read(top.from, top.to);
  const diagnostics: InkDiagnostic[] = [];
  for (const match of text.matchAll(BARE_GLUED_SET)) {
    const keyword = match[1]!;
    const value = match[2]!;
    if (GLUE.test(value)) continue;
    const glueFrom = match.index!;
    const keywordFrom = text.indexOf(keyword, glueFrom + 2);
    const valueFrom = text.indexOf(value, keywordFrom + keyword.length);
    if (!isStoryTextToken(top, glueFrom, "Punctuation")) continue;
    if (!isStoryTextToken(top, keywordFrom, "Word")) continue;
    diagnostics.push({
      message: `Inside a line, put the value of \`${keyword}\` in brackets, as in \`.. ${keyword}(${value}) | ...\`: without them the whole set is printed as text`,
      severity: ErrorType.Error,
      source: makeSource(valueFrom, valueFrom + value.length, ctx),
    });
  }
  return diagnostics;
}
