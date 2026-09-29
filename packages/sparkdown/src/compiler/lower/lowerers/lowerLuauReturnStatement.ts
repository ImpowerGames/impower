import { type SyntaxNode } from "@lezer/common";
import { MultiReturnType } from "../../../inkjs/compiler/Parser/ParsedHierarchy/MultiReturnType";
import { ReturnType } from "../../../inkjs/compiler/Parser/ParsedHierarchy/ReturnType";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import {
  lowerExpressionFromContainerAndContinuation,
  lowerExpressionFromNodes,
} from "../expression/lowerExpression";
import { takeLineContinuation } from "../utils/lineContinuation";

// `return X`          (single)   → ReturnType { expr }
// `return X, Y, Z`    (multi)    → MultiReturnType { [X, Y, Z] } — packs
//                                   the N values into a MultiValue at runtime
// `return`            (no value) → ReturnType { null } — produces Void
//
// Multi-return is detected by walking the statement's `_content`
// children: if more than one comma-separated expression group is
// present, emit `MultiReturnType`. Otherwise fall through to the
// existing single-expression `ReturnType` path.
//
// Lowers both `LuauReturnStatement` (Luau code) and
// `LuauSparkdownReturnStatement` (narrative bodies); they differ only in
// whether the value may start on the next line.

export function lowerLuauReturnStatement(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  // The lines that continue the last value (`return t` then `.a`).
  const continuation = takeLineContinuation(ctx);
  const contentNode = findChildByName(
    nodeRef.node,
    `${nodeRef.node.name}_content`,
  );
  if (contentNode) {
    const groups = splitContentOnCommas(contentNode, continuation);
    if (groups.length > 1) {
      const expressions = groups
        .map((nodes) => lowerExpressionFromNodes(nodes, ctx))
        .filter((e): e is NonNullable<typeof e> => e != null);
      if (expressions.length > 1) {
        return { content: [new MultiReturnType(expressions)] };
      }
      // Fell through — only one expression actually lowered. Drop
      // to single-value return so we still emit something useful.
    }
  }
  const expr = lowerExpressionFromContainerAndContinuation(
    nodeRef.node,
    continuation,
    ctx,
  );
  return { content: [new ReturnType(expr ?? null)] };
}

function findChildByName(parent: SyntaxNode, name: string): SyntaxNode | null {
  let child = parent.firstChild;
  while (child) {
    if (child.name === name) return child;
    child = child.nextSibling;
  }
  return null;
}

// The content's comma-separated values, followed by the continuation lines,
// whose commas separate further values.
function splitContentOnCommas(
  content: SyntaxNode,
  continuation: SyntaxNode[],
): SyntaxNode[][] {
  const children: SyntaxNode[] = [];
  for (let child = content.firstChild; child; child = child.nextSibling) {
    children.push(child);
  }
  const groups: SyntaxNode[][] = [];
  let current: SyntaxNode[] = [];
  for (const child of [...children, ...continuation]) {
    if (child.name === "LuauCommaSeparator") {
      if (current.length > 0) {
        groups.push(current);
        current = [];
      }
    } else if (!isSkippableName(child.name)) {
      current.push(child);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function isSkippableName(name: string): boolean {
  return (
    name === "ExtraWhitespace" ||
    name === "Whitespace" ||
    name === "Newline" ||
    name === "LuauReturnLineBreak" ||
    name === "LuauComment" ||
    name === "OptionalWhitespace" ||
    name === "RequiredWhitespace"
  );
}
