import { nodeNameSet } from "./nodeNameSet";
import { REASSIGNMENT_NAMES } from "./reassignmentNames";
import { VARIABLE_DEFINITION_NAMES } from "./variableDefinitionNames";

export const TRAILING_STATEMENT_NAMES: ReadonlySet<string> = new Set([
  ...nodeNameSet([
    "LuauReturnStatement",
    "LuauBreakStatement",
    "LuauContinueStatement",
    "LuauGotoStatement",
    "LuauLabel",
    "LuauFunctionDefinition",
    "LuauSparkdownExplicitStatement",
    "LuauSparkdownExplicitBlockStatement",
  ]),
  ...REASSIGNMENT_NAMES,
  ...VARIABLE_DEFINITION_NAMES,
]);
