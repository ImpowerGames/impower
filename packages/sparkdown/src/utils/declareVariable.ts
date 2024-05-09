import { SparkProgram } from "../types/SparkProgram";
import { SparkVariable } from "../types/SparkVariable";
import getVariableId from "./getVariableId";

const declareVariable = (program: SparkProgram, tok: SparkVariable) => {
  // Add variable declaration to program
  program.variables ??= {};
  if (tok.type && !tok.name) {
    // User is declaring a new type
    const typeName = tok.type;
    tok.name = typeName;
    tok.type = "type";
  }
  if (tok.type === "type") {
    program.variables[tok.name] = tok;
  } else {
    const id = getVariableId(tok);
    program.variables[id] = tok;
  }
  // Add variable value to context
  if (
    tok.type === "type" &&
    (typeof program.context?.[tok.name] === "object" ||
      program.context?.[tok.name] == null)
  ) {
    program.context ??= {};
    program.context[tok.name] ??= {};
    program.context[tok.name]!["default"] = tok.compiled;
  } else if (
    typeof tok.compiled === "object" &&
    (!Array.isArray(tok.compiled) || tok.type !== "object")
  ) {
    program.context ??= {};
    program.context[tok.type] ??= {};
    program.context[tok.type]![tok.name] = tok.compiled;
    if (!Array.isArray(tok.compiled)) {
      tok.compiled["$type"] = tok.type;
      tok.compiled["$name"] = tok.name;
    }
  } else {
    program.context ??= {};
    program.context[tok.name] = tok.compiled;
  }
};

export default declareVariable;
