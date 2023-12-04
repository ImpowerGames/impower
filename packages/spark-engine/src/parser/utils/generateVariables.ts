import type { SparkVariable } from "../../../../sparkdown/src/types/SparkVariable";
import { Variable } from "../../game/logic/types/Variable";

export const generateVariables = (
  file: string,
  variables: Record<string, SparkVariable>
): Record<string, Variable> => {
  const result: Record<string, Variable> = {};
  if (!variables) {
    return result;
  }
  Object.entries(variables).forEach(([variableId, v]) => {
    const variable: Variable = {
      source: {
        file,
        line: v.line,
        from: v.from,
        to: v.to,
      },
      stored: v.stored,
      name: v.name,
      type: v.type,
      value: v.value,
      compiled: v.compiled,
    };
    result[variableId] = variable;
  });

  return result;
};
