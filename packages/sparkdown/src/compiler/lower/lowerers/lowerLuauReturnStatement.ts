import { type SyntaxNode } from "@lezer/common";
import { MultiReturnType } from "../../../inkjs/compiler/Parser/ParsedHierarchy/MultiReturnType";
import { ReturnType } from "../../../inkjs/compiler/Parser/ParsedHierarchy/ReturnType";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import {
  lowerExpressionFromContainer,
  lowerExpressionFromNodes,
} from "../expression/lowerExpression";

// `return X`          (single)   → ReturnType { expr }
// `return X, Y, Z`    (multi)    → MultiReturnType { [X, Y, Z] } — packs
//                                   the N values into a MultiValue at runtime
// `return`            (no value) → ReturnType { null } — produces Void
//
// Multi-return is detected by walking the LuauReturnStatement_content
// children: if more than one comma-separated expression group is
// present, emit `MultiReturnType`. Otherwise fall through to the
// existing single-expression `ReturnType` path.

export function lowerLuauReturnStatement(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const contentNode = findChildByName(
    nodeRef.node,
    "LuauReturnStatement_content",
  );
  if (contentNode) {
    const groups = splitContentOnCommas(contentNode);
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
  const expr = lowerExpressionFromContainer(nodeRef.node, ctx);
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

function splitContentOnCommas(content: SyntaxNode): SyntaxNode[][] {
  const groups: SyntaxNode[][] = [];
  let current: SyntaxNode[] = [];
  let child = content.firstChild;
  while (child) {
    if (child.name === "LuauCommaSeparator") {
      if (current.length > 0) {
        groups.push(current);
        current = [];
      }
    } else if (!isSkippableName(child.name)) {
      current.push(child);
    }
    child = child.nextSibling;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function isSkippableName(name: string): boolean {
  return (
    name === "ExtraWhitespace" ||
    name === "Whitespace" ||
    name === "Newline" ||
    name === "LuauComment" ||
    name === "OptionalWhitespace" ||
    name === "RequiredWhitespace"
  );
}
