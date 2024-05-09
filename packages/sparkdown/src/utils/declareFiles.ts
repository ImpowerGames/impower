import { SparkProgram } from "../types/SparkProgram";
import declareVariable from "./declareVariable";
import populateVariableFields from "./populateVariableFields";
import processAssetVariable from "./processAssetVariable";

const declareFiles = (
  program: SparkProgram,
  files: {
    [type: string]: {
      [name: string]: {
        ext: string;
        src: string;
        text?: string;
      };
    };
  }
): void => {
  Object.entries(files).forEach(([type, objectsOfType]) => {
    if (typeof objectsOfType === "object" && !Array.isArray(objectsOfType)) {
      // Define variables of type
      Object.entries(objectsOfType).forEach(([name, compiled]) => {
        if (compiled) {
          const variable = {
            tag: "asset",
            line: -1,
            from: -1,
            to: -1,
            indent: 0,
            type: type,
            name: name,
            id: type + "." + name,
            compiled: JSON.parse(JSON.stringify(compiled)),
            implicit: true,
          };
          program.variables ??= {};
          program.variables[type + "." + name] ??= variable;
          processAssetVariable(variable);
          populateVariableFields(variable);
          declareVariable(program, variable);
        }
      });
    }
  });
};

export default declareFiles;
