import { nodeNameSet } from "./nodeNameSet";
import { REASSIGNMENT_NAMES } from "./reassignmentNames";
import { VARIABLE_DEFINITION_NAMES } from "./variableDefinitionNames";

// Statement-like nodes a variable definition's content can hold after a
// comma, where its value patterns reach them: a named function
// (`local a, g = 1, function h() end`), and, in a narrative definition,
// whose values are `LuauExpression`, any statement that reaches. A
// statement after whitespace ends the definition, so it is the body's
// next statement instead. These are ADJACENT statements, not trailing
// multi-RHS values, and the declared names are in scope in them; an
// anonymous function after a comma is a value.
export const TRAILING_STATEMENT_NAMES: ReadonlySet<string> = new Set([
  ...nodeNameSet([
    "LuauReturnStatement",
    "LuauBreakStatement",
    "LuauContinueStatement",
    "LuauGotoStatement",
    "LuauLabel",
    "LuauFunctionDefinition",
    "LuauUntilStatement",
    "LuauExplicitStatement",
    "LuauSparkdownExplicitStatement",
  ]),
  ...REASSIGNMENT_NAMES,
  ...VARIABLE_DEFINITION_NAMES,
]);
