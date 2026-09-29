import { nodeNameSet } from "./nodeNameSet";

// Statement-like nodes that `lowerVariableDefinition` lowers as statements
// rather than as trailing multi-RHS values. The grammar ends a definition
// at the whitespace before a statement that follows it on the line
// (`local x = 5 return x end`), so that statement is the definition's
// sibling; one of these nodes is in the definition's content only when its
// `LuauExpression` reads a declaration after a comma, and an anonymous
// function there is lowered as a value instead.
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
