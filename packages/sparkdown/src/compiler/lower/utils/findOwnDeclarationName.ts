import { type SyntaxNode } from "@lezer/common";

// Find the LuauFunctionDeclarationName that belongs to THIS
// LuauFunctionDefinition node, without descending into nested function
// definitions.
//
// `getDescendent` walks the whole subtree depth-first and would happily
// return the *inner* function's declaration name when called on an
// anonymous OUTER function — making the outer look named and disabling
// anonymous-fn dispatch entirely. This bit anonymous IIFEs containing
// a `local function NAME() ... end` declaration: the outer IIFE was
// classified as named, `lowerAnonymousFunction` bailed, and the call
// expression saw `nil` at runtime.
//
// The declaration name is always a direct child of
// `LuauFunctionDefinition_content` (or, in inline-body cases, sits
// adjacent to the body statements), so a direct-child scan is the
// correct scope.
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
