import { nodeNameSet } from "./nodeNameSet";

// Statement-like nodes that can appear as siblings inside a
// `LuauVariableDefinition_content` when sparkdown's grammar's
// permissive expression-pattern set lets multiple statements share
// a single source line — e.g. `local x = 5 return x end`. The
// grammar parses these correctly; they are ADJACENT statements, not
// trailing multi-RHS values, and the declared names are in scope in
// them.
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
