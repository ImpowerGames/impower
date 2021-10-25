import { VariableData } from "../../project/classes/instances/items/variable/variableData";

export const getVariableValue = <T>(
  variableId: string,
  variables: { [refId: string]: VariableData }
): T | undefined => {
  const data = variables[variableId];
  if (data) {
    return data.value as T;
  }
  return undefined;
};
