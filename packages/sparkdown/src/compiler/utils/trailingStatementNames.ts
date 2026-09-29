import { nodeNameSet } from "./nodeNameSet";

// Statement-like nodes that can appear as siblings inside a variable
// definition's content when multiple statements share a single source
// line: any statement in a narrative definition
// (`& local x = 5 return`), and a named function after a Luau one
// (`local x = 5 function h() end`), whose content takes no other
// statement. They are ADJACENT statements, not trailing multi-RHS
// values, and the declared names are in scope in them.
export const TRAILING_STATEMENT_NAMES: ReadonlySet<string> = nodeNameSet([
  "LuauReturnStatement",
  "LuauBreakStatement",
  "LuauContinueStatement",
  "LuauGotoStatement",
  "LuauLabel",
  "LuauFunctionDefinition",
  "LuauVariableDefinition",
  "LuauSparkdownVariableDefinition",
  "LuauUntilStatement",
  "LuauReassignment",
  "LuauExplicitStatement",
]);
