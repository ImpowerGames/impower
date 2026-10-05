import { type SyntaxNode } from "@lezer/common";
import { findChildByName } from "./alternatorArms";

// Returns the syntax node whose children contain a function-body's
// statements. Handles both parse-tree shapes the grammar can produce:
//
//   1. **Wrapped body** (any function with a statement in it). The
//      grammar's `LuauFunctionBody` opens right after the header, on the
//      header's line when a statement follows there and otherwise on the
//      next line, so every statement lives inside a
//      `LuauFunctionBody > LuauFunctionBody_content` subtree, separated
//      from the header pieces (name, parameters, return type) that remain
//      direct children of `LuauFunctionDefinition_content`.
//
//   2. **No body wrapper** (`function f() end`, or a `define` method,
//      whose rule has no `LuauFunctionBody`). Anything after the header
//      lives as direct children of the definition's `_content` alongside
//      the header pieces. The caller's `FUNCTION_BODY_SKIP` set filters
//      out the header pieces.
//
// Returns `null` if no body content is available (e.g. the input
// isn't a function-definition node, or it has no `_content` child).
//
// The wrapped-body shape exists specifically to keep
// `LuauFunctionParameters` from matching call-args inside the body
// (it would incorrectly catch `table.insert(t, 40)` as a parameter
// declaration). Inside the body region, the parser only includes
// `LuauBlockBody` patterns — no `LuauFunctionParameters`.
export function getFunctionBodyContent(
  fnDefNode: SyntaxNode,
): SyntaxNode | null {
  // `LuauMethodDefinition` is the `name(args) ... end` shorthand
  // inside a `define` block — same body shape as a function
  // definition but under its own content wrapper (and never with a
  // `LuauFunctionBody` sub-wrapper, since the rule's patterns include
  // `LuauBlockBody` directly).
  const content =
    findChildByName(fnDefNode, `${fnDefNode.name}_content`) ??
    findChildByName(fnDefNode, "LuauMethodDefinition_content");
  if (!content) return null;
  const bodyWrapper = findChildByName(content, "LuauFunctionBody") ??
    findChildByName(content, "LuauSparkdownExplicitFunctionBody");
  if (bodyWrapper) {
    return (
      findChildByName(bodyWrapper, `${bodyWrapper.name}_content`) ?? bodyWrapper
    );
  }
  return content;
}
