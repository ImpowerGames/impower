import { SparkProgram } from "../types/SparkProgram";
import { SparkVariable } from "../types/SparkVariable";
import declareVariable from "./declareVariable";
import populateVariableFields from "./populateVariableFields";

const declareBuiltins = (
  program: SparkProgram,
  builtins: {
    [type: string]: {
      [name: string]: any;
    };
  }
): void => {
  Object.entries(builtins).forEach(([k, v]) => {
    if (typeof v === "object" && !Array.isArray(v)) {
      // Define type
      if (v["default"]) {
        const compiled = v["default"];
        compiled["$type"] = k;
        const compiledType = typeof compiled;
        program.variables ??= {};
        const variableType = compiledType === "object" ? "type" : compiledType;
        const variableName = k;
        const variable: SparkVariable = {
          tag: "builtin",
          line: -1,
          from: -1,
          to: -1,
          indent: 0,
          type: variableType,
          name: variableName,
          id: variableType + "." + variableName,
          compiled,
          implicit: true,
        };
        populateVariableFields(variable);
        declareVariable(program, variable);
      }
      // Define variables of type
      Object.entries(v).forEach(([name, compiled]) => {
        if (name && name !== "$default") {
          const variableName = name;
          const variableType = k;
          if (typeof compiled === "object" && !Array.isArray(compiled)) {
            compiled["$type"] = k;
            compiled["$name"] = name;
            const variable: SparkVariable = {
              tag: "builtin",
              line: -1,
              from: -1,
              to: -1,
              indent: 0,
              type: variableType,
              name: variableName,
              id: variableType + "." + variableName,
              compiled: JSON.parse(JSON.stringify(compiled)),
              implicit: true,
            };
            populateVariableFields(variable);
            declareVariable(program, variable);
          } else {
            const variable: SparkVariable = {
              tag: "builtin",
              line: -1,
              from: -1,
              to: -1,
              indent: 0,
              type: variableType,
              name: variableName,
              id: variableType + "." + variableName,
              compiled: v,
              implicit: true,
            };
            declareVariable(program, variable);
          }
        }
      });
    } else {
      const type = typeof v;
      const name = k;
      const variable: SparkVariable = {
        tag: "builtin",
        line: -1,
        from: -1,
        to: -1,
        indent: 0,
        type: type,
        name: name,
        id: type + "." + name,
        compiled: v,
        implicit: true,
      };
      declareVariable(program, variable);
    }
  });
};

export default declareBuiltins;
