import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { type SyntaxNode } from "@lezer/common";
import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Text } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Text";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import type { LowerContext } from "../context";
import {
  containerValueNodes,
  FUNCTION_CALL_SHORTHAND_NODES,
  lowerExpressionFromContainer,
} from "../expression/lowerExpression";
import { reportReadingErrors } from "../expression/lowerFunction";
import { readExpressionAst } from "./luauAst";

export function lowerTagContent(
  tagContent: SyntaxNode,
  ctx: LowerContext,
): ParsedObject[] {
  type Seg =
    | { kind: "text"; raw: string }
    | { kind: "ref"; name: string }
    | { kind: "expr"; expr: Expression };
  const segs: Seg[] = [];

  let child =
    firstContentChild(tagContent, `${tagContent.name}_content`) ??
    tagContent.firstChild;
  let cursor = tagContent.from;
  while (child) {
    if (isExplicitRuleName(child.name, "LuauInterpolatedStringExpression")) {
      if (child.from > cursor) {
        segs.push({ kind: "text", raw: ctx.read(cursor, child.from) });
      }
      const content = findWrapperChild(child, "LuauInterpolatedStringExpression_content");
      const variable = content ? loneVariable(content) : null;
      if (variable) {
        segs.push({ kind: "ref", name: ctx.read(variable.from, variable.to) });
      } else {
        const reading = content ? readExpressionAst(containerValueNodes(child), ctx) : null;
        if (reading) reportReadingErrors(reading.source.errors, child, ctx, "string");
        segs.push({ kind: "text", raw: ctx.read(child.from, child.to) });
      }
      cursor = child.to;
    } else if (FUNCTION_CALL_SHORTHAND_NODES.has(child.name)) {
      if (child.from > cursor) {
        segs.push({ kind: "text", raw: ctx.read(cursor, child.from) });
      }
      const expr = lowerExpressionFromContainer(child, ctx);
      if (expr) segs.push({ kind: "expr", expr });
      cursor = child.to;
    }
    child = child.nextSibling;
  }
  if (tagContent.to > cursor) {
    segs.push({ kind: "text", raw: ctx.read(cursor, tagContent.to) });
  }

  trimBoundaryWhitespace(segs);

  const out: ParsedObject[] = [];
  for (const seg of segs) {
    if (seg.kind === "ref") {
      const ref = new VariableReference([new Identifier(seg.name)]);
      ref.outputWhenComplete = true;
      out.push(ref);
    } else if (seg.kind === "expr") {
      seg.expr.outputWhenComplete = true;
      out.push(seg.expr);
    } else if (seg.raw.length > 0) {
      out.push(new Text(seg.raw));
    }
  }
  return out;
}

function trimBoundaryWhitespace(
  segs: { kind: "text" | "ref" | "expr"; raw?: string; name?: string }[],
): void {
  const first = segs[0];
  if (first && first.kind === "text") {
    first.raw = first.raw!.replace(/^\s+/, "");
  }
  const last = segs[segs.length - 1];
  if (last && last.kind === "text") {
    last.raw = last.raw!.replace(/\s+$/, "");
  }
}

function loneVariable(container: SyntaxNode): SyntaxNode | null {
  let only: SyntaxNode | null = null;
  for (let node = container.firstChild; node; node = node.nextSibling) {
    if (node.from === node.to || node.name === "Whitespace" ||
        node.name === "ExtraWhitespace" || node.name === "OptionalWhitespace" ||
        node.name === "RequiredWhitespace" || node.name === "Newline") continue;
    if (only) return null;
    only = node;
  }
  if (!only) return null;
  if (only.name === "LuauVariable") return only;
  if (isExplicitRuleName(only.name, "LuauAccessPath")) {
    const content = findWrapperChild(only, "LuauAccessPath_content");
    return content ? loneVariable(content) : null;
  }
  return isExplicitRuleName(only.name, "LuauAccessPart") ? loneVariable(only) : null;
}

function firstContentChild(
  parent: SyntaxNode,
  wrapperName: string,
): SyntaxNode | null {
  const wrapper = findWrapperChild(parent, wrapperName);
  return wrapper ? wrapper.firstChild : null;
}

function findWrapperChild(
  parent: SyntaxNode,
  wrapperName: string,
): SyntaxNode | null {
  let child = parent.firstChild;
  while (child) {
    if (isExplicitRuleName(child.name, wrapperName)) return child;
    child = child.nextSibling;
  }
  return null;
}
