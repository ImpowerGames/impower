import { type SyntaxNode } from "@lezer/common";
import { findChildByName } from "./alternatorArms";

export function getFunctionBodyContent(
  fnDefNode: SyntaxNode,
): SyntaxNode | null {
  const content =
    findChildByName(fnDefNode, "LuauFunctionDefinition_content") ??
    findChildByName(fnDefNode, "LuauMethodDefinition_content");
  if (!content) return null;
  const bodyWrapper = findChildByName(content, "LuauFunctionBody");
  if (bodyWrapper) {
    return (
      findChildByName(bodyWrapper, "LuauFunctionBody_content") ?? bodyWrapper
    );
  }
  return content;
}
