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

function isSpace(node: SyntaxNode | null, ctx: LowerContext): boolean {
  if (node?.name === "Space") return true;
  return node?.name === "Punctuation" && ctx.read(node.from, node.to).trim() === "";
}

function glueEndingAt(dot: SyntaxNode | null, ctx: LowerContext): boolean {
  const first = dot?.prevSibling ?? null;
  if (!dot || !first || !isMark(dot, ".", ctx) || !isMark(first, ".", ctx)) return false;
  return first.to === dot.from && (first.prevSibling === null || isSpace(first.prevSibling, ctx));
}

function glueStartingAt(dot: SyntaxNode | null, ctx: LowerContext): boolean {
  const second = dot?.nextSibling ?? null;
  if (!dot || !second || !isMark(dot, ".", ctx) || !isMark(second, ".", ctx)) return false;
  return dot.to === second.from && (second.nextSibling === null || isSpace(second.nextSibling, ctx));
}

function skipSpaces(node: SyntaxNode | null, forward: boolean, ctx: LowerContext): SyntaxNode | null {
  let at = node;
  while (at && isSpace(at, ctx)) at = forward ? at.nextSibling : at.prevSibling;
  return at;
}

function isNamePart(node: SyntaxNode, ctx: LowerContext): boolean {
  return node.name === "Word" || isMark(node, "_", ctx);
}

function simpleValueEnd(first: SyntaxNode, ctx: LowerContext): SyntaxNode | null {
  const start = isMark(first, "-", ctx) ? first.nextSibling : first;
  if (!start || (start !== first && start.from !== first.to) || !isNamePart(start, ctx)) return null;
  let last = start;
  for (let next = start.nextSibling; next && next.from === last.to; next = next.nextSibling) {
    if (!isNamePart(next, ctx) && !isMark(next, ".", ctx)) break;
    last = next;
  }
  return isMark(last, ".", ctx) ? null : last;
}

function bareGluedValue(keyword: SyntaxNode, ctx: LowerContext): { from: number; to: number } | null {
  if (!isSpace(keyword.prevSibling, ctx) || !glueEndingAt(skipSpaces(keyword.prevSibling, false, ctx), ctx)) return null;
  if (!isSpace(keyword.nextSibling, ctx)) return null;
  const value = skipSpaces(keyword.nextSibling, true, ctx);
  const last = value ? simpleValueEnd(value, ctx) : null;
  if (!value || !last) return null;
  const bar = skipSpaces(last.nextSibling, true, ctx);
  if (!bar || !isMark(bar, "|", ctx)) return null;
  for (let at = bar.nextSibling; at; at = at.nextSibling) {
    if (at.name === "Glue" || (isSpace(at, ctx) && glueStartingAt(at.nextSibling, ctx))) {
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
