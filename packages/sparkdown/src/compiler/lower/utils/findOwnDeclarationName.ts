import { type SyntaxNode } from "@lezer/common";

export function findOwnDeclarationName(
  fnDefNode: SyntaxNode,
): SyntaxNode | null {
  let content: SyntaxNode | null = fnDefNode.firstChild;
  while (content) {
    if (content.name === "LuauFunctionDefinition_content") break;
    content = content.nextSibling;
  }
  const scanRoot = content ?? fnDefNode;
  let child = scanRoot.firstChild;
  while (child) {
    if (child.name === "LuauFunctionDeclarationName") return child;
    child = child.nextSibling;
  }
  return null;
}
