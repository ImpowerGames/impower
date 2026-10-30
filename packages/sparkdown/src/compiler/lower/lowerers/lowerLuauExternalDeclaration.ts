import { type SyntaxNode } from "@lezer/common";
import { ExternalDeclaration } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ExternalDeclaration";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import type { LowerContext } from "../context";
import { findChildByName } from "../utils/alternatorArms";

export function lowerLuauExternalDeclaration(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const content = findChildByName(
    nodeRef.node,
    "LuauExternalDeclaration_content",
  );
  if (!content) return {};

  const nameNode = findDescendant(content, "LuauFunctionName");
  if (!nameNode) return {};
  const name = ctx.read(nameNode.from, nameNode.to).trim();
  if (!name) return {};

  const paramsNode = findChildByName(content, "LuauFunctionParameters");
  const argNames: string[] = [];
  if (paramsNode) {
    const paramsContent = findChildByName(
      paramsNode,
      "LuauFunctionParameters_content",
    );
    if (paramsContent) {
      let c = paramsContent.firstChild;
      while (c) {
        if (
          c.name === "LuauFunctionParameter" ||
          c.name === "LuauVariadicParameter"
        ) {
          const text = ctx.read(c.from, c.to).trim();
          if (text) argNames.push(text);
        }
        c = c.nextSibling;
      }
    }
  }

  const declaration = new ExternalDeclaration(new Identifier(name), argNames);
  return { content: [declaration] };
}

function findDescendant(
  start: SyntaxNode,
  name: string,
): SyntaxNode | null {
  const stack: SyntaxNode[] = [start];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.name === name) return node;
    let child = node.firstChild;
    while (child) {
      stack.push(child);
      child = child.nextSibling;
    }
  }
  return null;
}
