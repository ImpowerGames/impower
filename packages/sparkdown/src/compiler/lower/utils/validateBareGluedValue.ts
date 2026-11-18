import type { SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../runtime/Error";
import type { InkDiagnostic } from "../../classes/annotators/CompilationAnnotator";
import { nodeNameSet } from "../../utils/nodeNameSet";
import type { LowerContext } from "../context";
import { makeSource } from "./validateDefineStructure";

const NOT_STORY_TEXT = nodeNameSet([
  "LuauString",
  "LuauDoubleQuotedString",
  "LuauSingleQuotedString",
  "LuauMultilineString",
  "LuauInterpolatedString",
  "Raw",
  "ChoiceStartRawContent",
  "ChoiceOnlyRawContent",
  "ChoiceInnerRawContent",
]);

const KEYWORDS = new Set(["match", "plural"]);

function isMark(node: SyntaxNode | null, mark: string, ctx: LowerContext): boolean {
  return node?.name === "Punctuation" && ctx.read(node.from, node.to) === mark;
}

function isSpace(node: SyntaxNode | null): boolean {
  return node?.name === "Space";
}

function glueEndingAt(dot: SyntaxNode | null, ctx: LowerContext): boolean {
  const first = dot?.prevSibling ?? null;
  if (!dot || !first || !isMark(dot, ".", ctx) || !isMark(first, ".", ctx)) return false;
  return first.to === dot.from && (first.prevSibling === null || isSpace(first.prevSibling));
}

function glueStartingAt(dot: SyntaxNode | null, ctx: LowerContext): boolean {
  const second = dot?.nextSibling ?? null;
  if (!dot || !second || !isMark(dot, ".", ctx) || !isMark(second, ".", ctx)) return false;
  return dot.to === second.from && (second.nextSibling === null || isSpace(second.nextSibling));
}

function skipSpaces(node: SyntaxNode | null, forward: boolean): SyntaxNode | null {
  let at = node;
  while (at && isSpace(at)) at = forward ? at.nextSibling : at.prevSibling;
  return at;
}

function bareGluedValue(keyword: SyntaxNode, ctx: LowerContext): { from: number; to: number } | null {
  if (!isSpace(keyword.prevSibling) || !glueEndingAt(skipSpaces(keyword.prevSibling, false), ctx)) return null;
  if (!isSpace(keyword.nextSibling)) return null;
  const value = skipSpaces(keyword.nextSibling, true);
  if (!value || isMark(value, "(", ctx) || isMark(value, "|", ctx)) return null;
  let last = value;
  let bar: SyntaxNode | null = value;
  while (bar && !isMark(bar, "|", ctx)) {
    if (bar.name === "Glue" || (isSpace(bar.prevSibling) && glueStartingAt(bar, ctx))) return null;
    if (!isSpace(bar)) last = bar;
    bar = bar.nextSibling;
  }
  if (!bar) return null;
  for (let at = bar.nextSibling; at; at = at.nextSibling) {
    if (at.name === "Glue" || (isSpace(at) && glueStartingAt(at.nextSibling, ctx))) {
      return { from: value.from, to: last.to };
    }
  }
  return null;
}

export function validateBareGluedValues(
  top: SyntaxNode,
  ctx: LowerContext,
): InkDiagnostic[] {
  const diagnostics: InkDiagnostic[] = [];
  const cursor = top.cursor();
  for (let more = true; more; ) {
    if (NOT_STORY_TEXT.has(cursor.name)) {
      more = cursor.next(false);
      continue;
    }
    if (cursor.name === "Word" && KEYWORDS.has(ctx.read(cursor.from, cursor.to))) {
      const keyword = ctx.read(cursor.from, cursor.to);
      const value = bareGluedValue(cursor.node, ctx);
      if (value) {
        diagnostics.push({
          message: `Inside a line, put the value of \`${keyword}\` in brackets, as in \`.. ${keyword}(${ctx.read(value.from, value.to)}) | ...\`: without them the whole set is printed as text`,
          severity: ErrorType.Error,
          source: makeSource(value.from, value.to, ctx),
        });
      }
    }
    more = cursor.next();
  }
  return diagnostics;
}
