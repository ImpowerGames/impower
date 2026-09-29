import { nodeNameSet } from "./nodeNameSet";

// A `local`, `store` or `const` declaration: `LuauVariableDefinition` in Luau
// code, where a comma that ends the line continues the list on the next
// line, and `LuauSparkdownVariableDefinition` in a narrative body, where the
// declaration ends at its line. Both have the same begin, content and end,
// so their wrapper nodes are `<name>_begin`, `<name>_content` and
// `<name>_end`.
export const VARIABLE_DEFINITION_NAMES = nodeNameSet([
  "LuauVariableDefinition",
  "LuauSparkdownVariableDefinition",
]);

export const VARIABLE_DEFINITION_CONTENT_NAMES = nodeNameSet([
  "LuauVariableDefinition_content",
  "LuauSparkdownVariableDefinition_content",
]);

export const VARIABLE_DEFINITION_BEGIN_NAMES = nodeNameSet([
  "LuauVariableDefinition_begin",
  "LuauSparkdownVariableDefinition_begin",
]);

export const VARIABLE_DEFINITION_END_NAMES = nodeNameSet([
  "LuauVariableDefinition_end",
  "LuauSparkdownVariableDefinition_end",
]);
