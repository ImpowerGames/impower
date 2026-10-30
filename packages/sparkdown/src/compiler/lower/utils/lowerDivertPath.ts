import { type SyntaxNode } from "@lezer/common";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import type { LowerContext } from "../context";
import { identifierAt } from "./debugMetadata";

export function lowerDivertPath(
  target: SyntaxNode,
  ctx: LowerContext,
): Identifier[] {
  const parts: Identifier[] = [];
  const visit = (node: SyntaxNode): void => {
    if (node.name === "DivertPartName") {
      parts.push(divertPartIdentifier(node, ctx));
      return;
    }
    let child = node.firstChild;
    while (child) {
      visit(child);
      child = child.nextSibling;
    }
  };
  visit(target);
  return parts;
}

export function divertPartIdentifier(
  part: SyntaxNode,
  ctx: LowerContext,
): Identifier {
  return identifierAt(part, ctx);
}
