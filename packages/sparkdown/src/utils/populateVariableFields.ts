import { SparkVariable } from "../types/SparkVariable";
import traverse from "./traverse";

const populateVariableFields = (variable: SparkVariable) => {
  if (variable.compiled && typeof variable.compiled === "object") {
    // Populate fields
    traverse(variable.compiled, (path, v) => {
      const parts = path.split(".");
      const field = {
        tag: "field",
        line: variable.line,
        from: -1,
        to: -1,
        indent: 0,
        path: parts.slice(0, -1).join("."),
        key: parts.at(-1) || "",
        id: parts.slice(0, -1).join(".") + (parts.at(-1) || ""),
        type: typeof v,
        value: JSON.stringify(v),
        compiled: v,
        implicit: true,
      };
      variable.fields ??= [];
      variable.fields.push(field);
    });
  }
};

export default populateVariableFields;