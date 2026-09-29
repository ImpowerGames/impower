import { nodeNameSet } from "./nodeNameSet";

// Statement-like nodes that a `LuauVariableDefinition_content` can hold.
// The grammar ends a definition at the whitespace before a statement that
// follows it on the line (`local x = 5 return x end`), so that statement
// is the definition's sibling; one of these nodes is in the content only
// when the definition's `LuauExpression` reads a declaration as a value
// after a comma. They are statements, not trailing multi-RHS values, and
// the declared names are in scope in them.
export const TRAILING_STATEMENT_NAMES: ReadonlySet<string> = nodeNameSet([
  "LuauReturnStatement",
  "LuauBreakStatement",
  "LuauContinueStatement",
  "LuauGotoStatement",
  "LuauLabel",
  "LuauFunctionDefinition",
  "LuauVariableDefinition",
  "LuauUntilStatement",
  "LuauReassignment",
  "LuauExplicitStatement",
]);
